import html
import logging
import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("cha_panela")

app = FastAPI(
    title="Chá de Panela - Pagamentos",
    description="API de pagamentos (Mercado Pago Checkout Pro) para a lista de presentes do Chá de Panela.",
    version="1.0.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

_sdk = None


def get_sdk():
    """Inicializa o SDK do Mercado Pago de forma lazy."""
    global _sdk
    if _sdk is None:
        token = os.environ.get("MP_ACCESS_TOKEN", "").strip()
        if not token:
            raise RuntimeError("MP_ACCESS_TOKEN não configurado.")
        import mercadopago

        _sdk = mercadopago.SDK(token)
    return _sdk


# ---------------------------------------------------------------------------
# Modelos
# ---------------------------------------------------------------------------
class CriarPagamentoRequest(BaseModel):
    id: str = Field(..., min_length=1, description="Identificador do presente", examples=["panelas"])
    nome: str = Field(..., min_length=1, description="Nome do presente", examples=["Jogo de Panelas"])
    valor: float = Field(..., gt=0, description="Valor em reais", examples=[490.0])
    site_url: str = Field(..., min_length=1, description="URL do site para retorno", examples=["https://meusite.com/"])


class CriarPagamentoResponse(BaseModel):
    init_point: str


# ---------------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------------
def build_back_url(site_url: str, status: str, item_id: str) -> str:
    """Adiciona ?pagamento=...&id=... preservando query existente e removendo fragmento (#)."""
    parts = urlsplit(site_url.strip())
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k not in ("pagamento", "id")]
    query += [("pagamento", status), ("id", item_id)]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))


def format_brl(valor: Any) -> str:
    try:
        v = float(valor)
    except (TypeError, ValueError):
        return str(valor)
    s = f"{v:,.2f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def send_payment_email(payment: dict) -> None:
    """Envia e-mail de notificação de pagamento aprovado (executado em background)."""
    try:
        items = (payment.get("additional_info") or {}).get("items") or []
        nome_item = (items[0].get("title") if items else None) or payment.get("description") or payment.get("external_reference") or "Presente"
        valor = payment.get("transaction_amount")
        valor_fmt = format_brl(valor)
        payer = payment.get("payer") or {}
        nome_pagador = " ".join(filter(None, [payer.get("first_name"), payer.get("last_name")])).strip()
        if not nome_pagador:
            card_holder = ((payment.get("card") or {}).get("cardholder") or {}).get("name")
            nome_pagador = card_holder or "Não informado"
        email_pagador = payer.get("email") or "Não informado"
        parcelas = payment.get("installments") or 1
        payment_id = payment.get("id")
        presente_id = payment.get("external_reference") or "-"

        subject = f"🎁 Presente recebido: {nome_item} - R$ {valor_fmt}"
        rows = [
            ("Presente", nome_item),
            ("ID do presente", presente_id),
            ("Valor pago", f"R$ {valor_fmt}"),
            ("Nome do pagador", nome_pagador),
            ("E-mail do pagador", email_pagador),
            ("Parcelas", f"{parcelas}x"),
            ("ID do pagamento", payment_id),
        ]
        rows_html = "".join(
            f"<tr><td style='padding:8px;border:1px solid #ddd;font-weight:bold;background:#f7f3ee'>{html.escape(str(k))}</td>"
            f"<td style='padding:8px;border:1px solid #ddd'>{html.escape(str(v))}</td></tr>"
            for k, v in rows
        )
        body = f"""
<html><body style="font-family:Georgia,serif;color:#333">
  <h2 style="color:#6b4e71">🎁 Um novo presente foi recebido!</h2>
  <p>Um convidado acabou de presentear vocês pelo site do Chá de Panela.</p>
  <table style="border-collapse:collapse;min-width:320px">{rows_html}</table>
  <p style="margin-top:16px;font-size:12px;color:#888">Mensagem automática - Chá de Panela Pagamentos</p>
</body></html>"""

        email_from = os.environ.get("EMAIL_FROM", "").strip()
        email_password = os.environ.get("EMAIL_PASSWORD", "").strip()
        email_to = os.environ.get("EMAIL_TO", "").strip() or email_from

        if not email_from or not email_password or not email_to:
            logger.warning("E-mail não configurado (EMAIL_FROM/EMAIL_PASSWORD/EMAIL_TO). Notificação apenas no log: %s", subject)
            for k, v in rows:
                logger.info("  %s: %s", k, v)
            return

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = email_from
        msg["To"] = email_to
        msg.attach(MIMEText(body, "html", "utf-8"))

        recipients = [e.strip() for e in email_to.split(",") if e.strip()]
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=30) as server:
            server.login(email_from, email_password)
            server.sendmail(email_from, recipients, msg.as_string())
        logger.info("E-mail de notificação enviado para %s (pagamento %s)", email_to, payment_id)
    except Exception:
        logger.exception("Erro ao enviar e-mail de notificação")


def process_payment(payment_id: str) -> None:
    """Busca o pagamento no Mercado Pago e envia e-mail se aprovado (background)."""
    try:
        result = get_sdk().payment().get(payment_id)
        status_code = result.get("status")
        payment = result.get("response") or {}
        if status_code != 200:
            logger.error("Falha ao buscar pagamento %s no Mercado Pago (HTTP %s): %s", payment_id, status_code, payment)
            return
        status = payment.get("status")
        logger.info("Pagamento %s: status=%s, presente=%s", payment_id, status, payment.get("external_reference"))
        if status == "approved":
            send_payment_email(payment)
    except Exception:
        logger.exception("Erro ao processar pagamento %s", payment_id)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/", summary="Health check")
def root():
    return {"status": "ok", "service": "Chá de Panela Pagamentos"}


@app.get("/version.json", include_in_schema=False)
def version():
    # Required deployment contract: serves static/version.json with CORS enabled.
    path = os.path.join(_STATIC_DIR, "version.json")
    if os.path.exists(path):
        return FileResponse(path, media_type="application/json", headers={"Access-Control-Allow-Origin": "*"})
    return JSONResponse({}, status_code=404, headers={"Access-Control-Allow-Origin": "*"})


@app.post(
    "/criar-pagamento",
    response_model=CriarPagamentoResponse,
    summary="Cria um checkout do Mercado Pago para um presente",
    description="Cria uma preference do Checkout Pro e retorna a URL (init_point) para redirecionar o convidado.",
)
def criar_pagamento(req: CriarPagamentoRequest):
    try:
        sdk = get_sdk()
    except Exception as e:
        logger.error("SDK Mercado Pago indisponível: %s", e)
        raise HTTPException(status_code=500, detail="Pagamento indisponível: o Mercado Pago não está configurado no servidor.")

    preference = {
        "items": [
            {
                "id": req.id,
                "title": req.nome,
                "quantity": 1,
                "unit_price": round(float(req.valor), 2),
                "currency_id": "BRL",
            }
        ],
        "back_urls": {
            "success": build_back_url(req.site_url, "aprovado", req.id),
            "failure": build_back_url(req.site_url, "falhou", req.id),
            "pending": build_back_url(req.site_url, "pendente", req.id),
        },
        "auto_return": "approved",
        "payment_methods": {"installments": 12},
        "statement_descriptor": "CHA PANELA NAT",
        "external_reference": req.id,
    }
    app_origin = os.environ.get("APP_ORIGIN", "").strip()
    if app_origin.startswith("https://"):
        from urllib.parse import urljoin

        preference["notification_url"] = urljoin(app_origin, "/webhook/mercadopago")

    try:
        result = sdk.preference().create(preference)
    except Exception:
        logger.exception("Erro ao criar preference no Mercado Pago")
        raise HTTPException(status_code=500, detail="Não foi possível iniciar o pagamento. Tente novamente em instantes.")

    status_code = result.get("status")
    response = result.get("response") or {}
    if status_code not in (200, 201) or not response.get("init_point"):
        logger.error("Mercado Pago retornou erro ao criar preference (HTTP %s): %s", status_code, response)
        msg = response.get("message") if isinstance(response, dict) else None
        detail = "Não foi possível iniciar o pagamento no Mercado Pago."
        if msg:
            detail += f" Detalhe: {msg}"
        raise HTTPException(status_code=500, detail=detail)

    logger.info("Preference criada para presente '%s' (R$ %s): %s", req.id, req.valor, response.get("id"))
    return {"init_point": response["init_point"]}


@app.post(
    "/webhook/mercadopago",
    summary="Webhook de notificações do Mercado Pago",
    description="Aceita query params (?topic=payment&id=123) ou JSON ({type: 'payment', data: {id}}). Sempre retorna 200.",
)
async def webhook_mercadopago(request: Request, background_tasks: BackgroundTasks):
    try:
        params = request.query_params
        topic: Optional[str] = params.get("topic") or params.get("type")
        payment_id: Optional[str] = params.get("id") or params.get("data.id")

        body: Any = {}
        try:
            raw = await request.body()
            if raw:
                body = await request.json()
        except Exception:
            body = {}

        if isinstance(body, dict):
            topic = body.get("type") or body.get("topic") or topic
            data = body.get("data")
            if isinstance(data, dict) and data.get("id"):
                payment_id = str(data["id"])
            elif body.get("id") and not payment_id and body.get("topic"):
                payment_id = str(body["id"])

        logger.info("Webhook recebido: topic=%s id=%s", topic, payment_id)

        if topic == "payment" and payment_id:
            background_tasks.add_task(process_payment, str(payment_id))
    except Exception:
        logger.exception("Erro ao tratar webhook do Mercado Pago")

    return JSONResponse({"status": "recebido"}, status_code=200)
