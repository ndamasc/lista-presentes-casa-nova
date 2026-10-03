/* ==========================================================================
   Chá de Panela – Nathalia e Raphael (tema Bridgerton)
   Site 100% estático: sem backend e sem banco de dados.
   Toda a configuração editável fica reunida no bloco CONFIG abaixo.
   ========================================================================== */

"use strict";

/* --------------------------------------------------------------------------
   1) CONFIGURAÇÃO (edite aqui — nada de dados espalhados pelo código)
   -------------------------------------------------------------------------- */
const CONFIG = {
    // Chave Pix do tipo aleatória (EVP) informada pelo casal. Pode ficar no código.
    pixKey: "130128b3-5808-4667-9721-cd33e7de8bd8",

    // Nome do recebedor exibido pelo banco. Máx. 25 caracteres, SEM acentos.
    recebedor: "NATHALIA E RAPHAEL",

    // Cidade do recebedor. Máx. 15 caracteres, SEM acentos.
    // >> PLACEHOLDER: troque "CIDADE" pela cidade real do casal antes de publicar. <<
    cidade: "CIDADE",

    // Identificador da transação (txid). "***" = sem txid específico (padrão p/ QR estático).
    txid: "***",

    // --- Pagamento com CARTÃO (link de pagamento): NÃO IMPLEMENTADO AINDA. ---
    // Deixe vazio por enquanto. Quando houver um link por presente, preencha o campo
    // "cartaoUrl" de cada presente (abaixo) OU uma URL base aqui. Documentado no README.
    cartaoLinkBase: "", // placeholder opcional — recurso desativado enquanto vazio

    // Aviso opcional ao casal ("quem presenteou"). Cole a URL do Formspree/endpoint.
    // Enquanto estiver vazio, o recurso fica DESATIVADO (nenhuma requisição é feita).
    avisoFormUrl: "",

    // URL do backend de pagamento com cartão (Mercado Pago).
    // Preencha com a URL do backend após fazer o deploy.
    // Enquanto vazio, o botão "Pagar com Cartão" não aparece.
    mercadoPagoBackendUrl: ""
};

/* --------------------------------------------------------------------------
   2) DADOS DOS PRESENTES (separados da lógica)
   id ............ identificador único (usado no localStorage)
   nome .......... texto exibido
   valor ......... número em reais (sem "R$")
   img ........... nome-base do arquivo em images/ (sem extensão) ou null p/ fallback
   alt ........... texto alternativo descritivo
   icone ......... emoji usado quando não há foto (img: null)
   -------------------------------------------------------------------------- */
const PRESENTES = [
    { id: "panelas",       nome: "Jogo de Panelas de Cerâmica", valor: 490, img: "panelas",            alt: "Jogo de panelas de cerâmica" },
    { id: "assadeiras",    nome: "Formas e Assadeiras",         valor: 250, img: "assadeiras",    alt: "Conjunto de três assadeiras retangulares antiaderentes" },
    { id: "frigideira",    nome: "Frigideira Antiaderente",     valor: 120, img: "frigideira",    alt: "Frigideira antiaderente vermelha com cabo preto" },
    { id: "faqueiro",      nome: "Faqueiro",                    valor: 180, img: "faqueiro",      alt: "Faqueiro inox em estojo de madeira" },
    { id: "pratos",        nome: "Conjunto de Pratos",          valor: 220, img: "pratos",        alt: "Aparelho de jantar bege com borda escura" },
    { id: "copos",         nome: "Conjunto de Copos",           valor: 80,  img: "copos",         alt: "Conjunto de copos de vidro" },
    { id: "tacas",         nome: "Conjunto de Taças",           valor: 110, img: "tacas",         alt: "Conjunto de taças de vinho de cristal" },
    { id: "xicaras",       nome: "Conjunto de Xícaras",         valor: 170, img: "xicaras",       alt: "Xícara de chá com pires em cerâmica" },
    { id: "jogo_banho",    nome: "Jogo de Banho",               valor: 180, img: "jogo_banho",    alt: "Jogo de toalhas de banho cinza dobradas" },
    { id: "toalhas",       nome: "Kit de Toalhas",              valor: 230, img: "toalhas",       alt: "Kit de toalhas cinza empilhadas" },
    { id: "edredom",       nome: "Edredom Casal",               valor: 480, img: "edredom",       alt: "Jogo de cama casal com estampa floral" },
    { id: "liquidificador",nome: "Liquidificador",              valor: 220, img: "liquidificador",alt: "Liquidificador preto com frutas no copo" },
    { id: "airfryer",      nome: "Air Fryer",                   valor: 450, img: "airfryer",      alt: "Air fryer preta de 3,5 litros" },
    { id: "cafeteira",     nome: "Cafeteira",                   valor: 300, img: "cafeteira",     alt: "Cafeteira elétrica inox com jarra de vidro" },
    { id: "sanduicheira",  nome: "Sanduicheira",                valor: 150, img: "sanduicheira",  alt: "Grill e sanduicheira inox" },
    { id: "almofadas",     nome: "Almofadas",                   valor: 100, img: "almofadas",     alt: "Par de capas de almofada azul e terracota" },
    { id: "utensilios",    nome: "Utensílios de Cozinha",       valor: 100, img: "utensilios",    alt: "Conjunto de utensílios de cozinha em inox" },
    { id: "tabua",         nome: "Tábua de Corte",              valor: 50,  img: "tabua",         alt: "Tábua de corte de madeira" },
    { id: "escorredor",    nome: "Escorredor de Louça",         valor: 90,  img: "escorredor",    alt: "Escorredor de louça" },
    { id: "potes",         nome: "Potes Organizadores",         valor: 80,  img: "potes",         alt: "Conjunto de potes organizadores herméticos" },
    { id: "temperos",      nome: "Kit de Temperos",             valor: 75,  img: "temperos",      alt: "Suporte de parede com potes de temperos" }
];

/* --------------------------------------------------------------------------
   3) UTILIDADES
   -------------------------------------------------------------------------- */
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// localStorage apenas para o PRÓPRIO visitante (conforto; não é reserva real)
const LS_KEY = "cha_panela_feitos";
function carregarFeitos() {
    try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]")); }
    catch { return new Set(); }
}
function salvarFeitos(set) {
    try { localStorage.setItem(LS_KEY, JSON.stringify([...set])); } catch { /* storage indisponível */ }
}
const feitos = carregarFeitos();

/* --------------------------------------------------------------------------
   4) PIX — BR Code EMV com CRC16-CCITT (gerado no cliente)
   -------------------------------------------------------------------------- */
function tlv(id, valor) {
    return id + String(valor.length).padStart(2, "0") + valor;
}
function crc16(str) {
    let crc = 0xFFFF;
    for (const byte of new TextEncoder().encode(str)) {
        crc ^= byte << 8;
        for (let i = 0; i < 8; i++) {
            crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
}
function gerarPix({ chave, valor, nome, cidade, txid }) {
    const gui = tlv("00", "br.gov.bcb.pix") + tlv("01", chave);
    let payload =
        tlv("00", "01") +                       // Payload Format Indicator
        tlv("26", gui) +                        // Merchant Account Information (Pix)
        tlv("52", "0000") +                     // Merchant Category Code
        tlv("53", "986") +                      // Moeda: BRL
        tlv("54", valor.toFixed(2)) +           // Valor
        tlv("58", "BR") +                       // País
        tlv("59", nome.substring(0, 25)) +      // Nome do recebedor
        tlv("60", cidade.substring(0, 15)) +    // Cidade
        tlv("62", tlv("05", txid)) +            // Dados adicionais (txid)
        "6304";                                 // CRC placeholder
    return payload + crc16(payload);
}

/* --------------------------------------------------------------------------
   5) RENDERIZAÇÃO DOS CARDS (sem innerHTML com dados — seguro contra XSS)
   -------------------------------------------------------------------------- */
const giftsContainer = document.getElementById("gifts");

function criarMidia(p) {
    const box = document.createElement("div");
    box.className = "card-media";

    if (p.img) {
        const picture = document.createElement("picture");
        const source = document.createElement("source");
        source.srcset = `images/${p.img}.webp`;
        source.type = "image/webp";

        const img = document.createElement("img");
        img.src = `images/${p.img}.jpg`;
        img.alt = p.alt;
        img.loading = "lazy";
        img.decoding = "async";
        img.width = 300;
        img.height = 300;
        img.addEventListener("error", () => {
            const fb = document.createElement("div");
            fb.className = "card-icon";
            fb.setAttribute("aria-hidden", "true");
            fb.textContent = p.icone || "🎁";
            box.replaceChildren(fb);
        });

        picture.append(source, img);
        box.append(picture);
    } else {
        const fb = document.createElement("div");
        fb.className = "card-icon";
        fb.setAttribute("aria-hidden", "true");
        fb.textContent = p.icone || "🎁";
        box.append(fb);
    }
    return box;
}

function criarCard(p) {
    const li = document.createElement("li");
    li.className = "card";
    li.dataset.id = p.id;

    const h3 = document.createElement("h3");
    h3.textContent = p.nome;

    const preco = document.createElement("div");
    preco.className = "price";
    preco.textContent = BRL.format(p.valor);

    const feito = document.createElement("div");
    feito.className = "card-feito";
    feito.textContent = feitos.has(p.id) ? "Você marcou como presenteado ✓" : "";

    const btn = document.createElement("button");
    btn.className = "reserve";
    btn.type = "button";
    btn.textContent = "Presentear";
    btn.setAttribute("aria-label", `Presentear com ${p.nome}, ${BRL.format(p.valor)}`);
    btn.addEventListener("click", () => abrirModal(p, btn));

    li.append(criarMidia(p), h3, preco, feito, btn);
    return li;
}

giftsContainer.append(...PRESENTES.map(criarCard));

/* --------------------------------------------------------------------------
   5-A) RETORNO DO PAGAMENTO MERCADO PAGO (chamado logo após renderizar os cards)
   MP redireciona para: ?pagamento=aprovado&id=ID_DO_PRESENTE
   -------------------------------------------------------------------------- */
(function verificarRetornoPagamento() {
    const p = new URLSearchParams(window.location.search);
    const status = p.get("pagamento");
    const id = p.get("id");
    if (!status || !id) return;

    if (status === "aprovado") {
        // Registrar no localStorage do visitante
        feitos.add(id);
        salvarFeitos(feitos);

        // Atualizar visual do card
        const cardFeito = giftsContainer?.querySelector(`[data-id="${id}"] .card-feito`);
        if (cardFeito) cardFeito.textContent = "Pago com cartão ✓";

        // Exibir toast de sucesso
        const toast = document.createElement("div");
        toast.className = "toast-pagamento";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        toast.textContent = "🎉 Pagamento aprovado! Obrigada pelo carinho!";
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 7000);
    }

    // Limpar todos os parâmetros gerados pelo Mercado Pago da URL
    const url = new URL(window.location);
    [
        "pagamento", "id", "collection_id", "collection_status",
        "payment_id", "status", "external_reference", "payment_type",
        "merchant_order_id", "preference_id", "site_id",
        "processing_mode", "merchant_account_id"
    ].forEach(k => url.searchParams.delete(k));
    history.replaceState({}, "", url);
})();

/* --------------------------------------------------------------------------
   6) MODAL (dialog nativo) — ESC, foco preso, aria-modal e backdrop nativos
   -------------------------------------------------------------------------- */
const pixModal      = document.getElementById("pixModal");
const closeModalBtn = document.getElementById("closeModal");
const modalGiftName = document.getElementById("modalGiftName");
const qrcodeEl      = document.getElementById("qrcode");
const pixCopiaCola  = document.getElementById("pixCopiaCola");
const btnCopyPix    = document.getElementById("btnCopyPix");
const btnFeito      = document.getElementById("btnFeito");
const copyStatus    = document.getElementById("copyStatus");

let presenteAtual = null;
let payloadAtual = "";
let botaoOrigem = null;

/* --------------------------------------------------------------------------
   6-A) PAGAMENTO COM CARTÃO — Mercado Pago (ativo quando mercadoPagoBackendUrl preenchido)
   -------------------------------------------------------------------------- */
let _btnCartao = null;
let _separadorCartao = null;

function inicializarBotaoCartao() {
    if (!CONFIG.mercadoPagoBackendUrl) return; // recurso desativado

    // Injetar estilos do botão MP uma única vez
    if (!document.getElementById("mp-cartao-style")) {
        const style = document.createElement("style");
        style.id = "mp-cartao-style";
        style.textContent = `
            .separador-pagamento {
                display: flex; align-items: center; gap: 12px;
                margin: 18px 0 12px; color: #999; font-size: 0.82rem;
                font-family: inherit;
            }
            .separador-pagamento::before,
            .separador-pagamento::after {
                content: ""; flex: 1; height: 1px; background: #e0d6ca;
            }
            .btn-cartao {
                display: block; width: 100%; padding: 13px 0;
                border: none; border-radius: 8px;
                background: #009ee3; color: #fff;
                font-size: 1rem; font-weight: 700; cursor: pointer;
                transition: background .2s; font-family: inherit;
                letter-spacing: .01em;
            }
            .btn-cartao:hover:not(:disabled) { background: #007ab8; }
            .btn-cartao:disabled { background: #b0c8d8; cursor: not-allowed; }
            .toast-pagamento {
                position: fixed; top: 24px; left: 50%;
                transform: translateX(-50%);
                background: #2e7d32; color: #fff;
                padding: 14px 28px; border-radius: 10px;
                z-index: 10000; font-size: 1rem;
                box-shadow: 0 4px 16px rgba(0,0,0,.3);
                font-family: inherit; text-align: center; max-width: 90vw;
            }
        `;
        document.head.appendChild(style);
    }

    // Criar separador "ou"
    _separadorCartao = document.createElement("div");
    _separadorCartao.className = "separador-pagamento";
    _separadorCartao.textContent = "ou pague com cartão";

    // Criar botão
    _btnCartao = document.createElement("button");
    _btnCartao.className = "btn-cartao";
    _btnCartao.type = "button";
    _btnCartao.textContent = "Pagar com Cartão / Débito 💳";

    // Inserir antes do botão "Já fiz o Pix"
    btnFeito.insertAdjacentElement("beforebegin", _separadorCartao);
    btnFeito.insertAdjacentElement("beforebegin", _btnCartao);

    _btnCartao.addEventListener("click", () => {
        if (presenteAtual) iniciarPagamentoCartao(presenteAtual);
    });
}

async function iniciarPagamentoCartao(presente) {
    if (!_btnCartao) return;
    _btnCartao.disabled = true;
    _btnCartao.textContent = "⏳ Aguarde...";
    copyStatus.textContent = "";

    try {
        const resp = await fetch(`${CONFIG.mercadoPagoBackendUrl}/criar-pagamento`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: presente.id,
                nome: presente.nome,
                valor: presente.valor,
                site_url: window.location.origin + window.location.pathname
            })
        });

        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(err || "Resposta inesperada do servidor");
        }

        const { init_point } = await resp.json();
        // Redirecionar para o checkout do Mercado Pago
        window.location.href = init_point;
    } catch (err) {
        console.error("Erro ao criar pagamento:", err);
        _btnCartao.disabled = false;
        _btnCartao.textContent = "Pagar com Cartão / Débito 💳";
        copyStatus.textContent = "Não foi possível iniciar o pagamento. Use o Pix ou tente novamente.";
    }
}

function desenharQR(texto) {
    qrcodeEl.replaceChildren();
    // qrcode-generator (global `qrcode`): tipo 0 = auto, correção "M"
    const qr = qrcode(0, "M");
    qr.addData(texto);
    qr.make();
    // createImgTag gera <img> com data URI (sem rede). Convertendo em elemento:
    const temp = document.createElement("div");
    temp.innerHTML = qr.createImgTag(5, 0); // escala 5, sem margem extra
    const img = temp.querySelector("img");
    img.removeAttribute("width");
    img.removeAttribute("height");
    img.alt = "QR Code Pix";
    qrcodeEl.append(img);
}

function abrirModal(presente, origem) {
    presenteAtual = presente;
    botaoOrigem = origem;

    modalGiftName.textContent = `${presente.nome} (${BRL.format(presente.valor)})`;

    payloadAtual = gerarPix({
        chave: CONFIG.pixKey,
        valor: presente.valor,
        nome: CONFIG.recebedor,
        cidade: CONFIG.cidade,
        txid: CONFIG.txid
    });

    desenharQR(payloadAtual);
    pixCopiaCola.textContent = payloadAtual;
    copyStatus.textContent = "";
    btnFeito.textContent = feitos.has(presente.id) ? "Já marcado ✓" : "Já fiz o Pix ✓";

    document.body.style.overflow = "hidden"; // scroll lock
    if (typeof pixModal.showModal === "function") {
        pixModal.showModal();
    } else {
        pixModal.setAttribute("open", ""); // fallback simples
    }
}

function fecharModal() {
    if (typeof pixModal.close === "function") pixModal.close();
    else pixModal.removeAttribute("open");
}

// Evento "close" nativo: devolve foco e restaura scroll
pixModal.addEventListener("close", () => {
    document.body.style.overflow = "";
    botaoOrigem?.focus();
});

closeModalBtn.addEventListener("click", fecharModal);

// Clique no fundo (backdrop) fecha
pixModal.addEventListener("click", (e) => {
    if (e.target === pixModal) fecharModal();
});

// Copiar código Pix (copia e cola) com fallback
btnCopyPix.addEventListener("click", async () => {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(payloadAtual);
        } else {
            const ta = document.createElement("textarea");
            ta.value = payloadAtual;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.append(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
        }
        copyStatus.textContent = "Código Pix copiado!";
    } catch {
        copyStatus.textContent = "Não foi possível copiar. Selecione o código acima e copie manualmente.";
    }
});

// "Já fiz o Pix": registra apenas localmente, para o próprio visitante
btnFeito.addEventListener("click", () => {
    if (!presenteAtual) return;
    feitos.add(presenteAtual.id);
    salvarFeitos(feitos);
    btnFeito.textContent = "Já marcado ✓";
    copyStatus.textContent = "Obrigada! Marcamos este presente na sua lista (só você vê).";

    const card = giftsContainer.querySelector(`[data-id="${presenteAtual.id}"] .card-feito`);
    if (card) card.textContent = "Você marcou como presenteado ✓";

    enviarAviso(presenteAtual); // opcional, só se CONFIG.avisoFormUrl estiver preenchido
});

/* --------------------------------------------------------------------------
   7) AVISO OPCIONAL AO CASAL (desativado enquanto CONFIG.avisoFormUrl vazio)
   -------------------------------------------------------------------------- */
function enviarAviso(presente) {
    if (!CONFIG.avisoFormUrl) return; // recurso desativado
    const dados = new FormData();
    dados.append("presente", presente.nome);
    dados.append("valor", BRL.format(presente.valor));
    fetch(CONFIG.avisoFormUrl, {
        method: "POST",
        body: dados,
        headers: { Accept: "application/json" }
    }).catch(() => { /* silencioso: é apenas um aviso de boa-fé */ });
}

/* --------------------------------------------------------------------------
   8) FLORES CAINDO — leve, pausa em aba oculta e respeita prefers-reduced-motion
   -------------------------------------------------------------------------- */
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const TIPOS_FLOR = ["🌸", "🪻", "🌹", "🍂"];
let timerFlores = null;

function createFlower() {
    const f = document.createElement("div");
    f.className = "flower";
    f.textContent = TIPOS_FLOR[Math.floor(Math.random() * TIPOS_FLOR.length)];

    const side = Math.random() > 0.5 ? "left" : "right";
    const positionX = side === "left" ? Math.random() * 20 : 80 + Math.random() * 20;
    f.style.left = positionX + "vw";
    f.style.top = "-40px";
    f.style.fontSize = (16 + Math.random() * 16) + "px";
    f.style.animationDuration = (6 + Math.random() * 7) + "s";

    document.body.appendChild(f);
    f.addEventListener("animationend", () => f.remove());
    setTimeout(() => f.remove(), 14000); // rede de segurança
}

function iniciarFlores() {
    if (prefersReduced || timerFlores) return;
    timerFlores = setInterval(createFlower, 900);
}
function pararFlores() {
    clearInterval(timerFlores);
    timerFlores = null;
}

document.addEventListener("visibilitychange", () => {
    if (document.hidden) pararFlores(); else iniciarFlores();
});

if (!prefersReduced) {
    for (let i = 0; i < 18; i++) setTimeout(createFlower, i * 400);
    iniciarFlores();
}

/* --------------------------------------------------------------------------
   9) INICIALIZAR BOTÃO DE CARTÃO (Mercado Pago) — ativo se backend configurado
   -------------------------------------------------------------------------- */
inicializarBotaoCartao();
