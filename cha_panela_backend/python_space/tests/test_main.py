from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

import app.main as main

client = TestClient(main.app)


def test_root():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "service": "Chá de Panela Pagamentos"}


def test_back_url():
    url = main.build_back_url("https://site.com/index.html#lista", "aprovado", "panelas")
    assert url == "https://site.com/index.html?pagamento=aprovado&id=panelas"


def test_criar_pagamento_ok():
    sdk = MagicMock()
    sdk.preference.return_value.create.return_value = {"status": 201, "response": {"id": "p1", "init_point": "https://mp/redirect?pref_id=p1"}}
    with patch.object(main, "get_sdk", return_value=sdk):
        r = client.post("/criar-pagamento", json={"id": "panelas", "nome": "Jogo de Panelas", "valor": 490.0, "site_url": "https://s.com"})
    assert r.status_code == 200
    assert r.json()["init_point"].endswith("p1")
    pref = sdk.preference.return_value.create.call_args[0][0]
    assert pref["external_reference"] == "panelas"
    assert pref["payment_methods"]["installments"] == 12


def test_criar_pagamento_erro():
    sdk = MagicMock()
    sdk.preference.return_value.create.return_value = {"status": 400, "response": {"message": "invalid"}}
    with patch.object(main, "get_sdk", return_value=sdk):
        r = client.post("/criar-pagamento", json={"id": "x", "nome": "X", "valor": 10, "site_url": "https://s.com"})
    assert r.status_code == 500
    assert "Mercado Pago" in r.json()["detail"]


def test_webhook_body_aprovado_envia_email():
    sdk = MagicMock()
    sdk.payment.return_value.get.return_value = {"status": 200, "response": {"id": 123, "status": "approved", "transaction_amount": 75.0, "installments": 2, "external_reference": "temperos", "description": "Kit de Temperos", "payer": {"email": "a@b.com"}}}
    with patch.object(main, "get_sdk", return_value=sdk), patch.object(main, "send_payment_email") as send:
        r = client.post("/webhook/mercadopago", json={"type": "payment", "data": {"id": "123"}})
    assert r.status_code == 200
    sdk.payment.return_value.get.assert_called_with("123")
    send.assert_called_once()


def test_webhook_query_nao_aprovado():
    sdk = MagicMock()
    sdk.payment.return_value.get.return_value = {"status": 200, "response": {"id": 9, "status": "rejected"}}
    with patch.object(main, "get_sdk", return_value=sdk), patch.object(main, "send_payment_email") as send:
        r = client.post("/webhook/mercadopago?topic=payment&id=9")
    assert r.status_code == 200
    send.assert_not_called()


def test_webhook_erro_sempre_200():
    with patch.object(main, "get_sdk", side_effect=RuntimeError("boom")):
        r = client.post("/webhook/mercadopago", content=b"nao-json", headers={"content-type": "application/json"})
    assert r.status_code == 200


def test_email_sem_config_nao_falha(monkeypatch):
    monkeypatch.setenv("EMAIL_FROM", "")
    monkeypatch.setenv("EMAIL_PASSWORD", "")
    main.send_payment_email({"id": 1, "transaction_amount": 490, "description": "Panelas"})
