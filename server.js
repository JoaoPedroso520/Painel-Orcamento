const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const { PrismaClient } = require("@prisma/client");

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 3000);
const PROVIDER_SESSION_TTL_DAYS = Math.max(
  1,
  Number(process.env.PROVIDER_SESSION_TTL_DAYS || 30)
);

const PAYMENT_METHODS = new Set([
  "PIX",
  "BOLETO",
  "CARTAO_CREDITO",
  "CARTAO_DEBITO",
  "DINHEIRO",
  "TRANSFERENCIA"
]);

const CATALOG_TYPES = new Set([
  "BASE_PROJECT",
  "MODULE",
  "FEATURE",
  "INTEGRATION",
  "SUPPORT"
]);

const QUOTE_STATUSES = new Set(["DRAFT", "SENT", "APPROVED", "COMPLETED", "REJECTED"]);
const PRICING_TIERS = new Set(["MVP", "PADRAO", "ROBUSTO"]);
const BILLING_STATUSES = new Set(["COBRAR", "PAGO"]);
const SUPPORT_CHARGE_VALUE = 100;
const FULLSTACK_CHARGE_VALUE = 200;

const PRICING_TIER_CONFIG = {
  MVP: { label: "MVP", multiplier: 0.9 },
  PADRAO: { label: "Padrao", multiplier: 1 },
  ROBUSTO: { label: "Robusto", multiplier: 1.35 }
};

const HOLIDAY_API_BASE = "https://date.nager.at/api/v3/PublicHolidays";
const HOLIDAY_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const EVENT_REMINDER_LOOKAHEAD_DAYS = 7;
const MAJOR_EVENT_KEYS = Object.freeze({
  ANO_NOVO: "Ano Novo",
  CARNAVAL: "Carnaval",
  PASCOA: "Pascoa",
  DIA_DAS_MAES: "Dia das Maes",
  DIA_DOS_NAMORADOS: "Dia dos Namorados",
  DIA_DOS_PAIS: "Dia dos Pais",
  HALLOWEEN: "Halloween",
  NATAL: "Natal",
});

const holidayCache = new Map();
let mailTransporter = null;
let mailConfigured = null;
let reminderLoopRunning = false;

// Estimativas em dias corridos com base em faixas de mercado publicadas para
// website/e-commerce/MVP e em complexidade tecnica de integracoes fiscais.
const SERVICE_ESTIMATED_DAYS = Object.freeze({
  "Landing page de conversao": 14,
  "Site institucional completo": 35,
  "Landing page layout pronto": 7,
  "Site institucional layout pronto": 14,
  "E-commerce layout pronto": 21,
  "E-commerce completo": 84,
  "Sistema web personalizado (MVP)": 84,
  "Portal web tipo SaaS (inicio)": 112,
  "Painel admin com pedidos": 14,
  "Cadastro de clientes (CRM basico)": 10,
  "Historico de cliente e interacoes": 7,
  "Cadastro de produtos com variacoes": 10,
  "Area de estoque com alertas": 12,
  "Painel de OS": 14,
  "Historico e auditoria do sistema": 8,
  "Area do cliente com login": 12,
  "Painel financeiro (contas e inadimplencia)": 14,
  "Dashboard de indicadores e metas": 10,
  "Relatorios em PDF e Excel": 8,
  "Permissoes por perfil de usuario": 8,
  "Upload e gestao de arquivos": 7,
  "Gateway de pagamento (PIX, boleto e cartao)": 14,
  "Integracao de frete e rastreio": 10,
  "Integracao com WhatsApp e e-mail transacional": 7,
  "Integracao com ERP/gestao": 30,
  "Emissao de NF-e/NFS-e": 35,
  "Integracao com API externa personalizada": 12,
  "Login social (Google e Meta)": 6,
  "SEO tecnico inicial": 5,
  "Deploy e publicacao com SSL": 3,
  "Otimizacao de performance (Core Web Vitals)": 7,
  "Suporte mensal evolutivo (10h/mes)": 30,
  "Eventos populares (mensal)": 30,
  "Suporte mensal de back-end": 30,
  "Suporte mensal de front-end": 30,
  "Monitoramento e backup automatizado": 7,
  "Seguranca basica e LGPD": 10
});

const DEFAULT_CATALOG_ITEMS = [
  {
    name: "Landing page de conversao",
    aliases: ["Landing page"],
    category: "Projeto base",
    description:
      "Inclui briefing, estrutura de copy, formulario integrado, SEO on-page inicial e publicacao.",
    type: "BASE_PROJECT",
    price: 2800
  },
  {
    name: "Site institucional completo",
    aliases: ["Site institucional"],
    category: "Projeto base",
    description:
      "Site corporativo com ate 10 paginas, formulario, mapa, blog basico e painel para ajustes simples.",
    type: "BASE_PROJECT",
    price: 5200
  },
  {
    name: "Landing page layout pronto",
    aliases: [
      "layout pronto",
      "leyout pronto",
      "site template 1 pagina",
      "Site com layout pronto (1 pagina)"
    ],
    category: "Projeto base",
    description:
      "Landing page com estrutura pronta e entrega rapida. Personalizacao inclusa: fotos, textos, logo e cores. Estrutura e funcionalidades do template permanecem fixas.",
    type: "BASE_PROJECT",
    price: 1900
  },
  {
    name: "Site institucional layout pronto",
    aliases: [
      "site template",
      "layout pronto 5 paginas",
      "Site com layout pronto (ate 5 paginas)"
    ],
    category: "Projeto base",
    description:
      "Site institucional em template pronto com ate 5 paginas. Personalizacao inclusa: fotos, textos, logo e paleta de cores. Sem alteracao estrutural do template.",
    type: "BASE_PROJECT",
    price: 2900
  },
  {
    name: "E-commerce layout pronto",
    aliases: [
      "loja template",
      "e-commerce layout pronto",
      "Loja com layout pronto (catalogo inicial)"
    ],
    category: "Projeto base",
    description:
      "Loja virtual em template pronto com catalogo inicial e paginas essenciais. Personalizacao inclusa: banners/fotos, textos, logo e cores. Recursos extras ficam fora do pacote.",
    type: "BASE_PROJECT",
    price: 4200
  },
  {
    name: "E-commerce completo",
    aliases: ["E-commerce essencial", "e-commerce"],
    category: "Projeto base",
    description:
      "Loja virtual com catalogo, carrinho, checkout, area do cliente e configuracao inicial de frete/pagamento.",
    type: "BASE_PROJECT",
    price: 14500
  },
  {
    name: "Sistema web personalizado (MVP)",
    aliases: ["Sistema web personalizado"],
    category: "Projeto base",
    description:
      "Sistema sob medida com arquitetura inicial, regras de negocio principais, autenticacao e fluxo operacional.",
    type: "BASE_PROJECT",
    price: 26000
  },
  {
    name: "Portal web tipo SaaS (inicio)",
    aliases: ["PDV"],
    category: "Projeto base",
    description:
      "Estrutura inicial para produto SaaS com area logada, onboarding, perfis e base para crescimento.",
    type: "BASE_PROJECT",
    price: 32000
  },
  {
    name: "Painel admin com pedidos",
    category: "Modulos",
    description:
      "Gestao de pedidos com filtros, alteracao de status, timeline do atendimento e acoes em lote.",
    type: "MODULE",
    price: 4800
  },
  {
    name: "Cadastro de clientes (CRM basico)",
    aliases: ["Cadastro de clientes", "cria um aba de cliente"],
    category: "Modulos",
    description:
      "Cadastro completo com campos personalizados, busca/filtros, historico de contato e tags por perfil.",
    type: "MODULE",
    price: 2600
  },
  {
    name: "Historico de cliente e interacoes",
    aliases: ["Historico de cliente"],
    category: "Modulos",
    description:
      "Linha do tempo por cliente com registros de atendimento, observacoes, anexos e ultima acao realizada.",
    type: "FEATURE",
    price: 1600
  },
  {
    name: "Cadastro de produtos com variacoes",
    aliases: ["Cadastro de produtos"],
    category: "Modulos",
    description:
      "Cadastro com categorias, SKU, variacoes (tamanho/cor), imagens e regras basicas de precificacao.",
    type: "MODULE",
    price: 3200
  },
  {
    name: "Area de estoque com alertas",
    aliases: ["Area de estoque", "Notificacao de Estoque"],
    category: "Modulos",
    description:
      "Controle de entrada/saida, estoque minimo, alerta automatico e movimentacao por usuario/responsavel.",
    type: "MODULE",
    price: 3600
  },
  {
    name: "Painel de OS",
    category: "Modulos",
    description:
      "Ordens de servico com fila, prioridade, responsavel tecnico, checklist de execucao e encerramento.",
    type: "MODULE",
    price: 3900
  },
  {
    name: "Historico e auditoria do sistema",
    aliases: ["Historico e auditoria"],
    category: "Modulos",
    description:
      "Registro de alteracoes (quem/quando/o que), trilha de auditoria e log exportavel para compliance.",
    type: "FEATURE",
    price: 2200
  },
  {
    name: "Area do cliente com login",
    aliases: ["Area do cliente", "Area do cliente com login"],
    category: "Modulos",
    description:
      "Portal do cliente com autenticacao, acompanhamento de pedidos/orcamentos e historico de solicitacoes.",
    type: "FEATURE",
    price: 3800
  },
  {
    name: "Painel financeiro (contas e inadimplencia)",
    aliases: ["Painel financeiro"],
    category: "Modulos",
    description:
      "Contas a receber/pagar, fluxo de caixa basico, inadimplencia, conciliacao simples e resumo mensal.",
    type: "FEATURE",
    price: 4500
  },
  {
    name: "Dashboard de indicadores e metas",
    aliases: [
      "Dashboard com graficos",
      "Dashboard de indicadores",
      "Relatorio de Vendas"
    ],
    category: "Modulos",
    description:
      "KPIs com filtros por periodo, graficos comparativos, metas e visao executiva para decisao rapida.",
    type: "FEATURE",
    price: 3400
  },
  {
    name: "Relatorios em PDF e Excel",
    category: "Modulos",
    description:
      "Exportacao de relatorios com filtros, paginacao, layout para impressao e download em PDF/XLSX.",
    type: "FEATURE",
    price: 1800
  },
  {
    name: "Permissoes por perfil de usuario",
    category: "Modulos",
    description:
      "Controle de acesso por funcao (admin, gestor, operador), com restricao por tela e por acao.",
    type: "FEATURE",
    price: 2100
  },
  {
    name: "Upload e gestao de arquivos",
    category: "Modulos",
    description:
      "Upload seguro com limite por tipo/tamanho, organizacao por pastas e vinculo dos arquivos ao cadastro.",
    type: "FEATURE",
    price: 1900
  },
  {
    name: "Gateway de pagamento (PIX, boleto e cartao)",
    aliases: ["Integracao gateway de pagamento", "Gateway de pagamento"],
    category: "Integracoes",
    description:
      "Integracao com gateway, callbacks de pagamento, conciliacao basica e tratamento de falhas comuns.",
    type: "INTEGRATION",
    price: 3000
  },
  {
    name: "Integracao de frete e rastreio",
    aliases: ["Integracao de frete", "Integracao com frete"],
    category: "Integracoes",
    description:
      "Calculo de frete, emissao de etiqueta, codigo de rastreio e atualizacao automatica de status.",
    type: "INTEGRATION",
    price: 2600
  },
  {
    name: "Integracao com WhatsApp e e-mail transacional",
    aliases: [
      "Integracao WhatsApp",
      "Integracao com WhatsApp e email",
      "Integracao com e-mail"
    ],
    category: "Integracoes",
    description:
      "Disparo automatico de mensagens por eventos (pedido, pagamento, lembrete) com templates padrao.",
    type: "INTEGRATION",
    price: 2400
  },
  {
    name: "Integracao com ERP/gestao",
    aliases: ["Integracao com ERP"],
    category: "Integracoes",
    description:
      "Sincronizacao de clientes, produtos, estoque e pedidos entre sistema interno e ERP externo.",
    type: "INTEGRATION",
    price: 5200
  },
  {
    name: "Emissao de NF-e/NFS-e",
    aliases: ["Emissao de NF-e/NFS-e"],
    category: "Integracoes",
    description:
      "Integracao fiscal com emissao, cancelamento, consulta de status, XML, homologacao e regras da Receita/SEFAZ. Valor mais alto por risco tecnico e tributario.",
    type: "INTEGRATION",
    price: 12000
  },
  {
    name: "Integracao com API externa personalizada",
    category: "Integracoes",
    description:
      "Consumo de API de terceiro com autenticacao, mapeamento de dados, fila de retentativa e logs.",
    type: "INTEGRATION",
    price: 3500
  },
  {
    name: "Login social (Google e Meta)",
    category: "Integracoes",
    description:
      "Acesso com contas externas, vinculacao de usuario existente e fluxo de recuperacao seguro.",
    type: "INTEGRATION",
    price: 1900
  },
  {
    name: "SEO tecnico inicial",
    aliases: ["SEO tecnico", "SEO tecnico inicial"],
    category: "Suporte",
    description:
      "Ajustes de indexacao, sitemap, metadados, headings e melhoria basica de velocidade de carregamento.",
    type: "SUPPORT",
    price: 1800
  },
  {
    name: "Deploy e publicacao com SSL",
    aliases: ["Deploy e infraestrutura", "Deploy e publicacao"],
    category: "Suporte",
    description:
      "Configuracao de hospedagem, dominio, SSL, variaveis de ambiente, rotina de deploy e checklist final.",
    type: "SUPPORT",
    price: 1900
  },
  {
    name: "Otimizacao de performance (Core Web Vitals)",
    category: "Suporte",
    description:
      "Reducao de tempo de carregamento, cache, compressao, lazy load e melhorias de UX de performance.",
    type: "SUPPORT",
    price: 2300
  },
  {
    name: "Suporte mensal evolutivo (10h/mes)",
    aliases: ["Suporte mensal", "Suporte mensal evolutivo (pacote 10h)"],
    category: "Suporte",
    description:
      "Plano mensal de 10 horas para manutencao, correcao de bugs, pequenas evolucoes e atendimento tecnico continuo.",
    type: "SUPPORT",
    price: 1800
  },
  {
    name: "Eventos populares (mensal)",
    aliases: ["eventos populares", "pacote eventos populares"],
    category: "Suporte",
    description:
      "Atualizacoes mensais de campanhas sazonais (Ano Novo, Carnaval, Pascoa, Dia das Maes, Dia dos Namorados, Dia dos Pais, Halloween e Natal). Valor mensal.",
    type: "SUPPORT",
    price: 200
  },
  {
    name: "Suporte mensal de back-end",
    aliases: ["back-end mensal", "suporte backend mensal"],
    category: "Suporte",
    description:
      "Acompanhamento mensal focado em servidor, API, banco de dados e estabilidade tecnica. Valor mensal.",
    type: "SUPPORT",
    price: 100
  },
  {
    name: "Suporte mensal de front-end",
    aliases: ["front-end mensal", "suporte frontend mensal"],
    category: "Suporte",
    description:
      "Acompanhamento mensal focado em interface, ajustes visuais e comportamento das telas. Valor mensal.",
    type: "SUPPORT",
    price: 100
  },
  {
    name: "Monitoramento e backup automatizado",
    category: "Suporte",
    description:
      "Monitoramento de disponibilidade, alertas de falha, rotina de backup e plano simples de recuperacao.",
    type: "SUPPORT",
    price: 1200
  },
  {
    name: "Seguranca basica e LGPD",
    category: "Suporte",
    description:
      "Hardening inicial, revisao de permissoes, protecao de dados sensiveis e ajustes basicos de conformidade.",
    type: "SUPPORT",
    price: 2200
  }
];

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));
app.use("/IMG", express.static(path.join(__dirname, "img")));
app.use("/img", express.static(path.join(__dirname, "img")));

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeProviderUsername(value) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function normalizeCatalogName(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function createUtcDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0));
}

function parseIsoDateToUtc(dateString) {
  const raw = normalizeText(dateString);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  return createUtcDate(year, month, day);
}

function shiftUtcDays(dateValue, days) {
  return new Date(dateValue.getTime() + (Number(days) * 24 * 60 * 60 * 1000));
}

function normalizeEventText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function dateKeyUtc(dateValue) {
  const y = dateValue.getUTCFullYear();
  const m = String(dateValue.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateValue.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function calculateEasterSundayUtc(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + (2 * e) + (2 * i) - h - k) % 7;
  const m = Math.floor((a + (11 * h) + (22 * l)) / 451);
  const month = Math.floor((h + l - (7 * m) + 114) / 31) - 1;
  const day = ((h + l - (7 * m) + 114) % 31) + 1;
  return createUtcDate(year, month, day);
}

function nthWeekdayOfMonthUtc(year, monthIndex, weekday, occurrence) {
  const safeOccurrence = Math.max(1, Number(occurrence) || 1);
  const firstDay = createUtcDate(year, monthIndex, 1);
  const firstWeekday = firstDay.getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + ((safeOccurrence - 1) * 7);
  return createUtcDate(year, monthIndex, day);
}

async function fetchPublicHolidays(year) {
  const cacheKey = `BR-${year}`;
  const cached = holidayCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.events;
  }

  const url = `${HOLIDAY_API_BASE}/${year}/BR`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Falha ao consultar feriados (${response.status})`);
  }

  const payload = await response.json();
  const events = Array.isArray(payload) ? payload : [];
  holidayCache.set(cacheKey, {
    expiresAt: now + HOLIDAY_CACHE_TTL_MS,
    events
  });
  return events;
}

function findHolidayByKeywords(holidays, keywords) {
  if (!Array.isArray(holidays) || holidays.length === 0) return null;
  return holidays.find((holiday) => {
    const searchable = normalizeEventText(`${holiday.localName || ""} ${holiday.name || ""}`);
    return keywords.some((keyword) => searchable.includes(keyword));
  }) || null;
}

function resolveEventDateFromHoliday(holiday) {
  if (!holiday || !holiday.date) return null;
  return parseIsoDateToUtc(holiday.date);
}

function dedupeEventsByKeyAndDate(events) {
  const map = new Map();
  events.forEach((event) => {
    const key = `${event.key}-${dateKeyUtc(event.date)}`;
    if (!map.has(key)) {
      map.set(key, event);
    }
  });
  return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

async function buildMajorEventSchedule(referenceDate = new Date()) {
  const nowUtc = new Date(referenceDate);
  const years = [nowUtc.getUTCFullYear(), nowUtc.getUTCFullYear() + 1];
  const events = [];

  for (const year of years) {
    let holidays = [];
    try {
      holidays = await fetchPublicHolidays(year);
    } catch (error) {
      console.error(`Erro ao buscar feriados do ano ${year}:`, error.message);
    }

    const goodFridayHoliday = findHolidayByKeywords(holidays, [
      "good friday",
      "sexta feira santa",
      "paixao de cristo"
    ]);
    const easterHoliday = findHolidayByKeywords(holidays, [
      "easter",
      "pascoa"
    ]);
    const carnivalHoliday = findHolidayByKeywords(holidays, [
      "carnival",
      "carnaval"
    ]);
    const christmasHoliday = findHolidayByKeywords(holidays, [
      "christmas",
      "natal"
    ]);
    const newYearHoliday = findHolidayByKeywords(holidays, [
      "new year",
      "confraternizacao universal",
      "ano novo"
    ]);

    const easterDate =
      resolveEventDateFromHoliday(easterHoliday) ||
      (resolveEventDateFromHoliday(goodFridayHoliday)
        ? shiftUtcDays(resolveEventDateFromHoliday(goodFridayHoliday), 2)
        : calculateEasterSundayUtc(year));
    const carnivalDate =
      resolveEventDateFromHoliday(carnivalHoliday) ||
      shiftUtcDays(easterDate, -47);
    const christmasDate =
      resolveEventDateFromHoliday(christmasHoliday) ||
      createUtcDate(year, 11, 25);
    const newYearDate =
      resolveEventDateFromHoliday(newYearHoliday) ||
      createUtcDate(year, 0, 1);
    const mothersDayDate = nthWeekdayOfMonthUtc(year, 4, 0, 2);
    const valentinesDayDate = createUtcDate(year, 5, 12);
    const fathersDayDate = nthWeekdayOfMonthUtc(year, 7, 0, 2);
    const halloweenDate = createUtcDate(year, 9, 31);

    events.push(
      { key: MAJOR_EVENT_KEYS.ANO_NOVO, label: "Ano Novo", date: newYearDate },
      { key: MAJOR_EVENT_KEYS.CARNAVAL, label: "Carnaval", date: carnivalDate },
      { key: MAJOR_EVENT_KEYS.PASCOA, label: "Pascoa", date: easterDate },
      { key: MAJOR_EVENT_KEYS.DIA_DAS_MAES, label: "Dia das Maes", date: mothersDayDate },
      { key: MAJOR_EVENT_KEYS.DIA_DOS_NAMORADOS, label: "Dia dos Namorados", date: valentinesDayDate },
      { key: MAJOR_EVENT_KEYS.DIA_DOS_PAIS, label: "Dia dos Pais", date: fathersDayDate },
      { key: MAJOR_EVENT_KEYS.HALLOWEEN, label: "Halloween", date: halloweenDate },
      { key: MAJOR_EVENT_KEYS.NATAL, label: "Natal", date: christmasDate },
    );
  }

  const deduped = dedupeEventsByKeyAndDate(events);
  return deduped.filter((event) => event.date.getTime() >= shiftUtcDays(nowUtc, -1).getTime());
}

function formatDateTimeBr(dateValue) {
  return new Date(dateValue).toLocaleString("pt-BR", { hour12: false });
}

function getEmailTransporter() {
  if (mailConfigured !== null) {
    return mailConfigured ? mailTransporter : null;
  }

  const host = normalizeText(process.env.SMTP_HOST);
  const port = Number(process.env.SMTP_PORT || 0);
  const user = normalizeText(process.env.SMTP_USER);
  const pass = normalizeText(process.env.SMTP_PASS);
  const secure = normalizeText(process.env.SMTP_SECURE).toLowerCase() === "true";

  if (!host || !Number.isFinite(port) || port <= 0 || !user || !pass) {
    mailConfigured = false;
    console.log(
      "Aviso: SMTP nao configurado. Lembretes por e-mail de eventos estao desativados."
    );
    return null;
  }

  mailTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });
  mailConfigured = true;
  return mailTransporter;
}

async function sendEventReminderMail({ provider, quote, event }) {
  const transporter = getEmailTransporter();
  if (!transporter) {
    return false;
  }

  const providerEmail = normalizeText(provider?.email);
  if (!providerEmail) {
    return false;
  }

  const fromEmail = normalizeText(process.env.SMTP_FROM) || normalizeText(process.env.SMTP_USER);
  const clientName = resolveMappedClientName(quote) || "Cliente";
  const companyName = resolveMappedCompanyName(quote) || clientName;
  const phone = quote.client?.phone || "-";
  const eventDateText = formatDateTimeBr(event.date);
  const triggerText = formatDateTimeBr(shiftUtcDays(event.date, -EVENT_REMINDER_LOOKAHEAD_DAYS));

  const subject = `[Lembrete de Evento] ${event.label} chegando para ${companyName}`;
  const bodyText = [
    `Ola ${provider.displayName || provider.username},`,
    "",
    `Este e um lembrete automatico: o evento ${event.label} esta se aproximando.`,
    `Data do evento: ${eventDateText}`,
    `Disparo automatico realizado em: ${triggerText}`,
    "",
    "Dados do cliente:",
    `Empresa: ${companyName}`,
    `Contato: ${clientName}`,
    `Telefone: ${phone}`,
    "",
    "Acao sugerida: iniciar preparacao uma semana antes do evento.",
    "",
    "Mensagem enviada automaticamente pelo sistema de gestao."
  ].join("\n");

  await transporter.sendMail({
    from: fromEmail,
    to: providerEmail,
    subject,
    text: bodyText
  });
  return true;
}

async function runEventReminderTick(force = false) {
  if (reminderLoopRunning) return;
  reminderLoopRunning = true;

  try {
    const now = new Date();
    const schedule = await buildMajorEventSchedule(now);
    if (!schedule.length) return;

    const contracts = await prisma.quote.findMany({
      where: {
        eventsPackContracted: true,
        status: {
          in: ["APPROVED", "COMPLETED"]
        },
        clientId: {
          not: null
        },
        provider: {
          is: {
            email: {
              not: null
            }
          }
        }
      },
      include: {
        client: true,
        provider: true
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    });

    for (const quote of contracts) {
      if (!quote.providerId || !quote.clientId) continue;
      for (const event of schedule) {
        const triggerDate = shiftUtcDays(event.date, -EVENT_REMINDER_LOOKAHEAD_DAYS);
        const todayKey = dateKeyUtc(now);
        const triggerKey = dateKeyUtc(triggerDate);
        const eventKey = dateKeyUtc(event.date);
        if (todayKey < triggerKey || todayKey > eventKey) {
          continue;
        }

        const existing = await prisma.eventReminderLog.findFirst({
          where: {
            providerId: quote.providerId,
            clientId: quote.clientId,
            eventKey: event.key,
            eventDate: event.date
          }
        });

        if (existing) continue;

        const sent = await sendEventReminderMail({
          provider: quote.provider,
          quote,
          event
        }).catch((error) => {
          console.error("Falha ao enviar e-mail de lembrete:", error.message);
          return false;
        });

        if (!sent) continue;

        await prisma.eventReminderLog.create({
          data: {
            providerId: quote.providerId,
            quoteId: quote.id,
            clientId: quote.clientId,
            eventKey: event.key,
            eventDate: event.date
          }
        });
      }
    }
  } catch (error) {
    console.error("Erro no loop de lembretes de eventos:", error.message);
  } finally {
    reminderLoopRunning = false;
  }
}

function defaultEstimatedDaysByType(type) {
  if (type === "BASE_PROJECT") {
    return 30;
  }
  if (type === "MODULE" || type === "FEATURE") {
    return 10;
  }
  if (type === "INTEGRATION") {
    return 12;
  }
  if (type === "SUPPORT") {
    return 7;
  }
  return 10;
}

function resolveEstimatedDays(item) {
  const explicitValue = Number(item?.estimatedDays);
  if (Number.isInteger(explicitValue) && explicitValue > 0) {
    return explicitValue;
  }

  const names = [item?.name, ...(item?.aliases || [])]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  for (const name of names) {
    if (SERVICE_ESTIMATED_DAYS[name]) {
      return SERVICE_ESTIMATED_DAYS[name];
    }
  }

  const normalizedCatalogNames = names.map((name) => normalizeCatalogName(name));
  const match = Object.entries(SERVICE_ESTIMATED_DAYS).find(([serviceName]) =>
    normalizedCatalogNames.includes(normalizeCatalogName(serviceName))
  );
  if (match) {
    return match[1];
  }

  return defaultEstimatedDaysByType(item?.type);
}

function parseId(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function toCents(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }
  return Math.round(parsed * 100);
}

function centsToMoney(value) {
  return Number((value / 100).toFixed(2));
}

function toPercentPoints(value) {
  // Normaliza virgula para ponto antes de converter
  const normalized = typeof value === "string" ? value.trim().replace(/,/g, ".") : value;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }
  return parsed * 100;
}

function percentPointsToPercent(value) {
  return Number(value) / 100;
}

function parseOptionalBirthDate(value) {
  const raw = normalizeText(value);
  if (!raw) {
    return null;
  }
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return "INVALID";
  }
  return parsed;
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function normalizeDocumentType(value) {
  const raw = normalizeText(value).toUpperCase();
  if (raw === "CPF" || raw === "CNPJ") {
    return raw;
  }
  return null;
}

function inferDocumentTypeFromNumber(value) {
  const digits = normalizeDigits(value);
  if (digits.length === 11) {
    return "CPF";
  }
  if (digits.length === 14) {
    return "CNPJ";
  }
  return null;
}

function validateClientDocument(documentType, documentNumber) {
  if (!documentNumber) {
    return null;
  }

  const inferredType = inferDocumentTypeFromNumber(documentNumber);
  if (!inferredType) {
    return "CPF/CNPJ invalido.";
  }

  if (documentType && documentType !== inferredType) {
    return "Tipo de documento nao corresponde ao numero informado.";
  }

  return null;
}

function hashPassword(rawPassword) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(String(rawPassword), salt, 120000, 64, "sha512")
    .toString("hex");
  return { salt, hash };
}

function verifyPassword(rawPassword, storedSalt, storedHash) {
  if (!storedSalt || !storedHash) {
    return false;
  }

  try {
    const hash = crypto
      .pbkdf2Sync(String(rawPassword), storedSalt, 120000, 64, "sha512")
      .toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
  } catch (_error) {
    return false;
  }
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function buildProviderSessionPayload() {
  const token = generateSessionToken();
  return {
    token,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + PROVIDER_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  };
}

function extractBearerToken(req) {
  const header = normalizeText(req.headers.authorization);
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return header.slice(7).trim();
}

async function requireProviderAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: "Autenticacao obrigatoria." });
  }

  const provider = await prisma.providerAccount.findFirst({
    where: {
      sessionTokenHash: hashSessionToken(token),
      sessionExpiresAt: {
        gt: new Date()
      }
    }
  });

  if (!provider) {
    return res.status(401).json({ message: "Sessao invalida ou expirada." });
  }

  req.authProvider = provider;
  return next();
}

function formatAddressForContract(client) {
  if (!client) {
    return null;
  }

  const baseLine = [client.addressStreet, client.addressNumber]
    .map(normalizeText)
    .filter(Boolean)
    .join(", ");
  const district = normalizeText(client.addressDistrict);
  const cityState = [normalizeText(client.addressCity), normalizeText(client.addressState)]
    .filter(Boolean)
    .join(" - ");
  const zipCode = normalizeText(client.addressZipCode);
  const complement = normalizeText(client.addressComplement);

  const parts = [baseLine, district, cityState, zipCode ? `CEP ${zipCode}` : "", complement].filter(
    Boolean
  );

  return parts.length > 0 ? parts.join(" | ") : null;
}

function pricingConfig(tier) {
  return PRICING_TIER_CONFIG[tier] || PRICING_TIER_CONFIG.PADRAO;
}

// A taxa da maquininha no crédito parcelado é cobrada pelo método "add-on" inverso:
// o valor que o cliente paga é: negotiated / (1 - feeRate)
// assim o prestador recebe exatamente o valor negociado.
// Quando passMachineFeeToClient=true: totalToCharge = negotiated / (1 - feeRate)
// Quando passMachineFeeToClient=false: totalToCharge = negotiated, netAmount = negotiated - machineFee
function calculateQuoteTotals(quote) {
  const rawSubtotalCents = quote.items.reduce((acc, item) => acc + item.lineTotalCents, 0);

  const tier = pricingConfig(quote.pricingTier);
  const tieredSubtotalCents = Math.round(rawSubtotalCents * tier.multiplier);
  const tierImpactCents = tieredSubtotalCents - rawSubtotalCents;

  const adjustmentRate = (quote.adjustmentPercentPoints || 0) / 10000;
  const adjustmentCents = Math.round(tieredSubtotalCents * adjustmentRate);
  const adjustedSubtotalCents = Math.max(tieredSubtotalCents + adjustmentCents, 0);

  const discountRate = (quote.discountPercentPoints || 0) / 10000;
  const discountCents = Math.round(adjustedSubtotalCents * discountRate);
  const negotiatedSubtotalCents = Math.max(adjustedSubtotalCents - discountCents, 0);

  // feeRate: ex. 49.79919678714859% => percentPoints = 4979.919678714859, feeRate = 0.4979919678714859
  const feeRate = quote.hasMachineFee ? (quote.machineFeePercentPoints || 0) / 10000 : 0;

  let totalToChargeCents;
  let machineFeeCents;
  let netAmountCents;

  if (quote.hasMachineFee && feeRate > 0) {
    if (quote.passMachineFeeToClient) {
      // Cliente paga o gross-up: gross = net / (1 - feeRate)
      totalToChargeCents = Math.round(negotiatedSubtotalCents / (1 - feeRate));
      machineFeeCents = totalToChargeCents - negotiatedSubtotalCents;
      netAmountCents = negotiatedSubtotalCents;
    } else {
      // Prestador absorve: cobra o negociado, recebe net = negociado - taxa
      totalToChargeCents = negotiatedSubtotalCents;
      machineFeeCents = Math.round(negotiatedSubtotalCents * feeRate);
      netAmountCents = negotiatedSubtotalCents - machineFeeCents;
    }
  } else {
    totalToChargeCents = negotiatedSubtotalCents;
    machineFeeCents = 0;
    netAmountCents = negotiatedSubtotalCents;
  }

  const installmentCount = Math.max(1, quote.installments || 1);
  // Parcela exata sem arredondamento prematuro
  const installmentValueExact = totalToChargeCents / installmentCount;
  const installmentValueCents = Math.round(installmentValueExact);

  return {
    rawSubtotal: centsToMoney(rawSubtotalCents),
    tierImpact: centsToMoney(tierImpactCents),
    tierMultiplier: tier.multiplier,
    tierLabel: tier.label,
    adjustmentPercent: percentPointsToPercent(quote.adjustmentPercentPoints || 0),
    adjustmentValue: centsToMoney(adjustmentCents),
    discountPercent: percentPointsToPercent(quote.discountPercentPoints || 0),
    discountValue: centsToMoney(discountCents),
    negotiatedSubtotal: centsToMoney(negotiatedSubtotalCents),
    machineFeeRate: feeRate,
    machineFee: centsToMoney(machineFeeCents),
    totalToCharge: centsToMoney(totalToChargeCents),
    netAmount: centsToMoney(netAmountCents),
    installmentValue: centsToMoney(installmentValueCents)
  };
}

function mapCatalogItem(item) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    description: item.description,
    type: item.type,
    price: centsToMoney(item.priceCents),
    estimatedDays: item.estimatedDays,
    active: item.active,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function mapQuoteItem(item) {
  return {
    id: item.id,
    catalogItemId: item.catalogItemId,
    name: item.nameSnapshot,
    category: item.categorySnapshot,
    unitPrice: centsToMoney(item.unitPriceCents),
    estimatedDays: item.estimatedDays,
    quantity: item.quantity,
    lineTotal: centsToMoney(item.lineTotalCents),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function sameNormalizedText(a, b) {
  const left = normalizeText(a).toLowerCase();
  const right = normalizeText(b).toLowerCase();
  if (!left || !right) return false;
  return left === right;
}

function resolveMappedClientName(quote) {
  const storedName = normalizeText(quote?.clientName);
  const personName = normalizeText(quote?.client?.name);
  const companyName = normalizeText(quote?.client?.companyName);

  if (personName && (!storedName || (companyName && sameNormalizedText(storedName, companyName)))) {
    return personName;
  }

  if (storedName && (!companyName || !sameNormalizedText(storedName, companyName))) {
    return storedName;
  }

  return personName || null;
}

function resolveMappedCompanyName(quote) {
  const companyName = normalizeText(quote?.client?.companyName);
  const personName = normalizeText(quote?.client?.name);
  const storedName = normalizeText(quote?.clientName);
  return companyName || personName || storedName || null;
}

function mapQuote(quote) {
  return {
    id: quote.id,
    title: quote.title,
    clientId: quote.clientId,
    clientName: resolveMappedClientName(quote),
    companyName: resolveMappedCompanyName(quote),
    client: quote.client
      ? {
          id: quote.client.id,
          name: quote.client.name,
          companyName: quote.client.companyName,
          email: quote.client.email,
          phone: quote.client.phone,
          documentType: quote.client.documentType,
          documentNumber: quote.client.documentNumber,
          addressZipCode: quote.client.addressZipCode,
          addressState: quote.client.addressState,
          addressCity: quote.client.addressCity,
          addressDistrict: quote.client.addressDistrict,
          addressStreet: quote.client.addressStreet,
          addressNumber: quote.client.addressNumber,
          addressComplement: quote.client.addressComplement,
          contractAddress: formatAddressForContract(quote.client),
          birthDate: quote.client.birthDate
        }
      : null,
    notes: quote.notes,
    status: quote.status,
    pricingTier: quote.pricingTier,
    adjustmentPercent: percentPointsToPercent(quote.adjustmentPercentPoints || 0),
    discountPercent: percentPointsToPercent(quote.discountPercentPoints || 0),
    paymentMethod: quote.paymentMethod,
    installments: quote.installments,
    hasMachineFee: quote.hasMachineFee,
    machineFeePercent: percentPointsToPercent(quote.machineFeePercentPoints || 0),
    passMachineFeeToClient: quote.passMachineFeeToClient,
    monthlyPlanContracted: Boolean(quote.monthlyPlanContracted),
    eventsPackContracted: Boolean(quote.eventsPackContracted),
    backendSupportContracted: Boolean(quote.backendSupportContracted),
    frontendSupportContracted: Boolean(quote.frontendSupportContracted),
    frontendBillingStatus: quote.frontendBillingStatus || "COBRAR",
    fullstackBillingStatus: quote.fullstackBillingStatus || "COBRAR",
    totals: calculateQuoteTotals(quote),
    items: quote.items.map(mapQuoteItem),
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt
  };
}

function mapQuoteHistory(quote) {
  const totals = calculateQuoteTotals(quote);

  return {
    id: quote.id,
    title: quote.title,
    clientId: quote.clientId,
    clientName: resolveMappedClientName(quote) || "Sem cliente",
    companyName: resolveMappedCompanyName(quote) || "Sem empresa",
    status: quote.status,
    itemCount: quote.items.length,
    paymentMethod: quote.paymentMethod,
    installments: quote.installments,
    pricingTier: quote.pricingTier,
    monthlyPlanContracted: Boolean(quote.monthlyPlanContracted),
    eventsPackContracted: Boolean(quote.eventsPackContracted),
    backendSupportContracted: Boolean(quote.backendSupportContracted),
    frontendSupportContracted: Boolean(quote.frontendSupportContracted),
    frontendBillingStatus: quote.frontendBillingStatus || "COBRAR",
    fullstackBillingStatus: quote.fullstackBillingStatus || "COBRAR",
    totalToCharge: totals.totalToCharge,
    netAmount: totals.netAmount,
    machineFee: totals.machineFee,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt
  };
}

function onlyDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function nextUpcomingEvent(schedule, now = new Date()) {
  if (!Array.isArray(schedule) || schedule.length === 0) return null;
  return schedule.find((event) => event.date.getTime() >= now.getTime()) || schedule[0];
}

function mapManagementQuoteRecord(quote, nextEvent) {
  const totals = calculateQuoteTotals(quote);
  const clientName = resolveMappedClientName(quote) || "Cliente";
  const companyName = resolveMappedCompanyName(quote) || clientName;
  const phone = normalizeText(quote.client?.phone);
  const email = normalizeText(quote.client?.email);
  const paymentLabel = `${quote.paymentMethod || "PIX"} | ${quote.installments || 1}x`;
  const nextEventDate = nextEvent ? nextEvent.date : null;
  const triggerDate = nextEventDate ? shiftUtcDays(nextEventDate, -EVENT_REMINDER_LOOKAHEAD_DAYS) : null;

  return {
    quoteId: quote.id,
    title: quote.title,
    status: quote.status,
    companyName,
    clientName,
    phone,
    phoneDigits: onlyDigits(phone),
    email,
    payment: paymentLabel,
    totalToCharge: totals.totalToCharge,
    updatedAt: quote.updatedAt,
    monthlyPlanContracted: Boolean(quote.monthlyPlanContracted),
    eventsPackContracted: Boolean(quote.eventsPackContracted),
    backendSupportContracted: Boolean(quote.backendSupportContracted),
    frontendSupportContracted: Boolean(quote.frontendSupportContracted),
    frontendBillingStatus: quote.frontendBillingStatus || "COBRAR",
    fullstackBillingStatus: quote.fullstackBillingStatus || "COBRAR",
    nextEvent: nextEvent
      ? {
          key: nextEvent.key,
          label: nextEvent.label,
          date: nextEventDate,
          triggerDate
        }
      : null
  };
}

function mapClientSummary(client) {
  const closedQuotes = client.quotes.filter((quote) => quote.status !== "DRAFT");
  const totalValue = closedQuotes.reduce(
    (acc, quote) => acc + calculateQuoteTotals(quote).totalToCharge,
    0
  );
  const approvedCount = closedQuotes.filter((quote) => quote.status === "APPROVED").length;
  const averageTicket = closedQuotes.length > 0 ? totalValue / closedQuotes.length : 0;
  const lastQuote = closedQuotes[0] || null;

  return {
    id: client.id,
    name: client.name,
    companyName: client.companyName,
    email: client.email,
    phone: client.phone,
    documentType: client.documentType,
    documentNumber: client.documentNumber,
    addressZipCode: client.addressZipCode,
    addressState: client.addressState,
    addressCity: client.addressCity,
    addressDistrict: client.addressDistrict,
    addressStreet: client.addressStreet,
    addressNumber: client.addressNumber,
    addressComplement: client.addressComplement,
    contractAddress: formatAddressForContract(client),
    birthDate: client.birthDate,
    notes: client.notes,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    stats: {
      totalQuotes: closedQuotes.length,
      approvedQuotes: approvedCount,
      totalValue: Number(totalValue.toFixed(2)),
      averageTicket: Number(averageTicket.toFixed(2)),
      lastQuoteAt: lastQuote ? lastQuote.updatedAt : null
    }
  };
}

function mapClientDetails(client) {
  const closedQuotes = client.quotes.filter((quote) => quote.status !== "DRAFT");

  return {
    id: client.id,
    name: client.name,
    companyName: client.companyName,
    email: client.email,
    phone: client.phone,
    documentType: client.documentType,
    documentNumber: client.documentNumber,
    addressZipCode: client.addressZipCode,
    addressState: client.addressState,
    addressCity: client.addressCity,
    addressDistrict: client.addressDistrict,
    addressStreet: client.addressStreet,
    addressNumber: client.addressNumber,
    addressComplement: client.addressComplement,
    contractAddress: formatAddressForContract(client),
    birthDate: client.birthDate,
    notes: client.notes,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    quoteHistory: closedQuotes.map((quote) => ({
      ...mapQuoteHistory(quote),
      items: quote.items.map(mapQuoteItem)
    }))
  };
}

function mapProviderAccount(provider) {
  return {
    id: provider.id,
    username: provider.username,
    displayName: provider.displayName,
    email: provider.email,
    phone: provider.phone,
    cnpj: provider.cnpj,
    address: provider.address,
    city: provider.city,
    lastLoginAt: provider.lastLoginAt,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt
  };
}

async function ensureDraftQuote(providerId) {
  const draft = await prisma.quote.findFirst({
    where: {
      providerId,
      status: "DRAFT"
    },
    orderBy: { updatedAt: "desc" }
  });

  if (draft) {
    return draft;
  }

  return prisma.quote.create({
    data: {
      providerId,
      title: "Novo projeto",
      pricingTier: "PADRAO"
    }
  });
}

async function getQuoteById(providerId, quoteId) {
  return prisma.quote.findFirst({
    where: {
      id: quoteId,
      providerId
    },
    include: {
      client: true,
      items: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }
    }
  });
}

async function touchQuote(providerId, quoteId) {
  await prisma.quote.updateMany({
    where: {
      id: quoteId,
      providerId
    },
    data: {
      updatedAt: new Date()
    }
  });
}

app.use("/api", async (req, res, next) => {
  const isPublicProviderRoute =
    (req.path === "/provider/register" || req.path === "/provider/login") &&
    req.method === "POST";

  if (isPublicProviderRoute) {
    return next();
  }

  try {
    return await requireProviderAuth(req, res, next);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao validar autenticacao." });
  }
});

app.get("/api/catalog", async (req, res) => {
  try {
    const providerId = req.authProvider.id;
    const search = normalizeText(req.query.search).toLowerCase();

    const items = await prisma.catalogItem.findMany({
      where: {
        providerId,
        active: true
      },
      orderBy: [{ category: "asc" }, { name: "asc" }]
    });

    const filtered = search
      ? items.filter((item) =>
          [item.name, item.category, item.description, item.type].join(" ").toLowerCase().includes(search)
        )
      : items;

    res.json(filtered.map(mapCatalogItem));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar catalogo." });
  }
});

app.post("/api/catalog", async (req, res) => {
  const providerId = req.authProvider.id;
  const name = normalizeText(req.body.name);
  const category = normalizeText(req.body.category);
  const description = normalizeText(req.body.description);
  const type = normalizeText(req.body.type).toUpperCase() || "MODULE";
  const priceCents = toCents(req.body.price);
  const estimatedDays = Math.round(Number(req.body.estimatedDays || 0));

  if (!name || !category || !description) {
    return res
      .status(400)
      .json({ message: "Nome, categoria e descricao sao obrigatorios." });
  }

  if (!CATALOG_TYPES.has(type)) {
    return res.status(400).json({ message: "Tipo de item invalido." });
  }

  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    return res
      .status(400)
      .json({ message: "Preco invalido. Informe um valor maior que zero." });
  }

  if (!Number.isInteger(estimatedDays) || estimatedDays <= 0) {
    return res.status(400).json({
      message: "Prazo invalido. Informe quantidade de dias maior que zero."
    });
  }

  try {
    const created = await prisma.catalogItem.create({
      data: {
        providerId,
        name,
        category,
        description,
        type,
        priceCents,
        estimatedDays
      }
    });

    res.status(201).json(mapCatalogItem(created));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao criar item do catalogo." });
  }
});

app.patch("/api/catalog/:itemId", async (req, res) => {
  const providerId = req.authProvider.id;
  const itemId = parseId(req.params.itemId);
  if (!itemId) {
    return res.status(400).json({ message: "Item de catalogo invalido." });
  }

  const name = normalizeText(req.body.name);
  const category = normalizeText(req.body.category);
  const description = normalizeText(req.body.description);
  const type = normalizeText(req.body.type).toUpperCase() || "MODULE";
  const priceCents = toCents(req.body.price);
  const estimatedDays = Math.round(Number(req.body.estimatedDays || 0));

  if (!name || !category || !description) {
    return res
      .status(400)
      .json({ message: "Nome, categoria e descricao sao obrigatorios." });
  }

  if (!CATALOG_TYPES.has(type)) {
    return res.status(400).json({ message: "Tipo de item invalido." });
  }

  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    return res
      .status(400)
      .json({ message: "Preco invalido. Informe um valor maior que zero." });
  }

  if (!Number.isInteger(estimatedDays) || estimatedDays <= 0) {
    return res.status(400).json({
      message: "Prazo invalido. Informe quantidade de dias maior que zero."
    });
  }

  try {
    const item = await prisma.catalogItem.findFirst({
      where: {
        id: itemId,
        providerId
      }
    });
    if (!item || !item.active) {
      return res.status(404).json({ message: "Item nao encontrado." });
    }

    const updated = await prisma.catalogItem.update({
      where: { id: itemId },
      data: {
        name,
        category,
        description,
        type,
        priceCents,
        estimatedDays
      }
    });

    const quoteItems = await prisma.quoteItem.findMany({
      where: {
        catalogItemId: itemId,
        quote: {
          providerId
        }
      },
      select: { id: true, quantity: true }
    });

    if (quoteItems.length > 0) {
      await prisma.$transaction(
        quoteItems.map((entry) =>
          prisma.quoteItem.update({
            where: { id: entry.id },
            data: {
              nameSnapshot: updated.name,
              categorySnapshot: updated.category,
              unitPriceCents: updated.priceCents,
              estimatedDays: updated.estimatedDays,
              lineTotalCents: entry.quantity * updated.priceCents
            }
          })
        )
      );
    }

    res.json(mapCatalogItem(updated));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao editar item do catalogo." });
  }
});

app.delete("/api/catalog/:itemId", async (req, res) => {
  const providerId = req.authProvider.id;
  const itemId = parseId(req.params.itemId);
  if (!itemId) {
    return res.status(400).json({ message: "Item de catalogo invalido." });
  }

  try {
    const item = await prisma.catalogItem.findFirst({
      where: {
        id: itemId,
        providerId
      }
    });

    if (!item || !item.active) {
      return res.status(404).json({ message: "Item de catalogo nao encontrado." });
    }

    await prisma.$transaction([
      prisma.catalogItem.update({
        where: { id: itemId },
        data: { active: false }
      }),
      prisma.quoteItem.deleteMany({
        where: {
          catalogItemId: itemId,
          quote: {
            providerId,
            status: "DRAFT"
          }
        }
      })
    ]);

    res.json({ message: "Item excluido do catalogo com sucesso." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao excluir item do catalogo." });
  }
});

app.get("/api/clients", async (req, res) => {
  try {
    const providerId = req.authProvider.id;
    const search = normalizeText(req.query.search);
    const digitSearch = normalizeDigits(search);
    const where = search
      ? {
          providerId,
          OR: [
            { name: { contains: search } },
            { companyName: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
            ...(digitSearch ? [{ documentNumber: { contains: digitSearch } }] : [])
          ]
        }
      : { providerId };

    const clients = await prisma.client.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      include: {
        quotes: {
          include: { items: true },
          orderBy: [{ updatedAt: "desc" }]
        }
      }
    });

    res.json(clients.map(mapClientSummary));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar clientes." });
  }
});

app.get("/api/clients/:clientId", async (req, res) => {
  const providerId = req.authProvider.id;
  const clientId = parseId(req.params.clientId);
  if (!clientId) {
    return res.status(400).json({ message: "Cliente invalido." });
  }

  try {
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        providerId
      },
      include: {
        quotes: {
          include: {
            client: true,
            items: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }]
            }
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
        }
      }
    });

    if (!client) {
      return res.status(404).json({ message: "Cliente nao encontrado." });
    }

    res.json(mapClientDetails(client));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar cliente." });
  }
});

app.post("/api/clients", async (req, res) => {
  const providerId = req.authProvider.id;
  const name = normalizeText(req.body.name);
  const companyName = normalizeText(req.body.companyName);
  const email = normalizeText(req.body.email);
  const phone = normalizeText(req.body.phone);
  const documentNumber = normalizeDigits(req.body.documentNumber);
  const rawDocumentType = normalizeDocumentType(req.body.documentType);
  const inferredDocumentType = inferDocumentTypeFromNumber(documentNumber);
  const documentType = documentNumber ? rawDocumentType || inferredDocumentType : null;
  const addressZipCode = normalizeText(req.body.addressZipCode);
  const addressState = normalizeText(req.body.addressState);
  const addressCity = normalizeText(req.body.addressCity);
  const addressDistrict = normalizeText(req.body.addressDistrict);
  const addressStreet = normalizeText(req.body.addressStreet);
  const addressNumber = normalizeText(req.body.addressNumber);
  const addressComplement = normalizeText(req.body.addressComplement);
  const notes = normalizeText(req.body.notes);
  const birthDate = parseOptionalBirthDate(req.body.birthDate);

  if (
    !name ||
    !companyName ||
    !email ||
    !phone ||
    !documentNumber ||
    !documentType ||
    !addressZipCode ||
    !addressState ||
    !addressCity ||
    !addressDistrict ||
    !addressStreet ||
    !addressNumber
  ) {
    return res.status(400).json({
      message:
        "Preencha todos os campos obrigatorios do cliente (nome, empresa, contato, CPF/CNPJ e endereco)."
    });
  }

  if (birthDate === "INVALID") {
    return res.status(400).json({ message: "Data de aniversario invalida." });
  }

  const documentError = validateClientDocument(documentType, documentNumber);
  if (documentError) {
    return res.status(400).json({ message: documentError });
  }

  try {
    const emailOwner = await prisma.client.findFirst({
      where: {
        providerId,
        email
      }
    });
    if (emailOwner) {
      return res.status(409).json({ message: "Ja existe cliente com esse e-mail." });
    }

    const documentOwner = await prisma.client.findFirst({
      where: {
        providerId,
        documentNumber
      }
    });
    if (documentOwner) {
      return res.status(409).json({ message: "Ja existe cliente com esse CPF/CNPJ." });
    }

    const client = await prisma.client.create({
      data: {
        providerId,
        name,
        companyName,
        email,
        phone,
        documentType,
        documentNumber,
        addressZipCode,
        addressState,
        addressCity,
        addressDistrict,
        addressStreet,
        addressNumber,
        addressComplement: addressComplement || null,
        birthDate,
        notes: notes || null
      },
      include: {
        quotes: {
          include: { items: true },
          orderBy: [{ updatedAt: "desc" }]
        }
      }
    });

    res.status(201).json(mapClientSummary(client));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao criar cliente." });
  }
});

app.patch("/api/clients/:clientId", async (req, res) => {
  const providerId = req.authProvider.id;
  const clientId = parseId(req.params.clientId);
  if (!clientId) {
    return res.status(400).json({ message: "Cliente invalido." });
  }

  const name = normalizeText(req.body.name);
  const companyName = normalizeText(req.body.companyName);
  const email = normalizeText(req.body.email);
  const phone = normalizeText(req.body.phone);
  const documentNumber = normalizeDigits(req.body.documentNumber);
  const rawDocumentType = normalizeDocumentType(req.body.documentType);
  const inferredDocumentType = inferDocumentTypeFromNumber(documentNumber);
  const documentType = documentNumber ? rawDocumentType || inferredDocumentType : null;
  const addressZipCode = normalizeText(req.body.addressZipCode);
  const addressState = normalizeText(req.body.addressState);
  const addressCity = normalizeText(req.body.addressCity);
  const addressDistrict = normalizeText(req.body.addressDistrict);
  const addressStreet = normalizeText(req.body.addressStreet);
  const addressNumber = normalizeText(req.body.addressNumber);
  const addressComplement = normalizeText(req.body.addressComplement);
  const notes = normalizeText(req.body.notes);
  const birthDate = parseOptionalBirthDate(req.body.birthDate);

  if (
    !name ||
    !companyName ||
    !email ||
    !phone ||
    !documentNumber ||
    !documentType ||
    !addressZipCode ||
    !addressState ||
    !addressCity ||
    !addressDistrict ||
    !addressStreet ||
    !addressNumber
  ) {
    return res.status(400).json({
      message:
        "Preencha todos os campos obrigatorios do cliente (nome, empresa, contato, CPF/CNPJ e endereco)."
    });
  }

  if (birthDate === "INVALID") {
    return res.status(400).json({ message: "Data de aniversario invalida." });
  }

  const documentError = validateClientDocument(documentType, documentNumber);
  if (documentError) {
    return res.status(400).json({ message: documentError });
  }

  try {
    const existingClient = await prisma.client.findFirst({
      where: {
        id: clientId,
        providerId
      }
    });
    if (!existingClient) {
      return res.status(404).json({ message: "Cliente nao encontrado." });
    }

    const emailOwner = await prisma.client.findFirst({
      where: {
        providerId,
        email,
        id: {
          not: clientId
        }
      }
    });
    if (emailOwner) {
      return res.status(409).json({ message: "Ja existe cliente com esse e-mail." });
    }

    const documentOwner = await prisma.client.findFirst({
      where: {
        providerId,
        documentNumber,
        id: {
          not: clientId
        }
      }
    });
    if (documentOwner) {
      return res.status(409).json({ message: "Ja existe cliente com esse CPF/CNPJ." });
    }

    const updated = await prisma.client.update({
      where: { id: clientId },
      data: {
        providerId,
        name,
        companyName,
        email,
        phone,
        documentType,
        documentNumber,
        addressZipCode,
        addressState,
        addressCity,
        addressDistrict,
        addressStreet,
        addressNumber,
        addressComplement: addressComplement || null,
        birthDate,
        notes: notes || null
      },
      include: {
        quotes: {
          include: { items: true },
          orderBy: [{ updatedAt: "desc" }]
        }
      }
    });

    await prisma.quote.updateMany({
      where: {
        providerId,
        clientId
      },
      data: { clientName: updated.name || null }
    });

    res.json(mapClientSummary(updated));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao atualizar cliente." });
  }
});

app.post("/api/provider/register", async (req, res) => {
  const username = normalizeProviderUsername(req.body.username);
  const displayName = normalizeText(req.body.displayName);
  const email = normalizeText(req.body.email);
  const phone = normalizeText(req.body.phone);
  const cnpj = normalizeText(req.body.cnpj);
  const address = normalizeText(req.body.address);
  const city = normalizeText(req.body.city);
  const password = normalizeText(req.body.password);

  if (!username || !password || !displayName || !email || !phone || !cnpj || !address || !city) {
    return res
      .status(400)
      .json({ message: "Preencha todos os campos obrigatorios para criar o acesso." });
  }

  if (username.length < 3 || username.length > 60) {
    return res.status(400).json({
      message:
        "Nome de usuario invalido. Use entre 3 e 60 caracteres."
    });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "Senha deve ter ao menos 6 caracteres." });
  }

  try {
    const existing = await prisma.providerAccount.findUnique({
      where: {
        username
      }
    });
    if (existing) {
      return res.status(409).json({ message: "Esse nome de usuario ja esta em uso." });
    }

    const passwordData = hashPassword(password);
    const session = buildProviderSessionPayload();
    const provider = await prisma.providerAccount.create({
      data: {
        username,
        displayName,
        email,
        phone,
        cnpj,
        address,
        city,
        passwordHash: passwordData.hash,
        passwordSalt: passwordData.salt,
        sessionTokenHash: session.tokenHash,
        sessionExpiresAt: session.expiresAt,
        lastLoginAt: new Date()
      }
    });

    res.status(201).json({
      message: "Acesso do prestador criado com sucesso.",
      authToken: session.token,
      provider: mapProviderAccount(provider)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao criar acesso do prestador." });
  }
});

app.post("/api/provider/login", async (req, res) => {
  const username = normalizeProviderUsername(req.body.username);
  const password = normalizeText(req.body.password);

  if (!username || !password) {
    return res.status(400).json({ message: "Informe nome de usuario e senha para login." });
  }

  try {
    const provider = await prisma.providerAccount.findUnique({
      where: { username }
    });

    if (!provider || !verifyPassword(password, provider.passwordSalt, provider.passwordHash)) {
      return res.status(401).json({ message: "Credenciais invalidas." });
    }

    const session = buildProviderSessionPayload();
    const updated = await prisma.providerAccount.update({
      where: { id: provider.id },
      data: {
        sessionTokenHash: session.tokenHash,
        sessionExpiresAt: session.expiresAt,
        lastLoginAt: new Date()
      }
    });

    res.json({
      message: "Login efetuado com sucesso.",
      authToken: session.token,
      provider: mapProviderAccount(updated)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao realizar login do prestador." });
  }
});

app.get("/api/provider/me", async (req, res) => {
  try {
    const providerId = req.authProvider.id;
    const provider = await prisma.providerAccount.findUnique({
      where: { id: providerId }
    });

    if (!provider) {
      return res.status(404).json({ message: "Prestador nao encontrado." });
    }

    res.json(mapProviderAccount(provider));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar dados do prestador." });
  }
});


app.patch("/api/provider/me", async (req, res) => {
  try {
    const providerId = req.authProvider.id;
    const displayName = normalizeText(req.body.displayName);
    const email = normalizeText(req.body.email);
    const phone = normalizeText(req.body.phone);
    const cnpj = normalizeText(req.body.cnpj);
    const address = normalizeText(req.body.address);
    const city = normalizeText(req.body.city);

    if (!displayName || !email || !phone || !cnpj || !address || !city) {
      return res.status(400).json({ message: "Preencha todos os campos obrigatorios." });
    }

    const updated = await prisma.providerAccount.update({
      where: { id: providerId },
      data: {
        displayName,
        email,
        phone,
        cnpj,
        address,
        city
      }
    });

    res.json({
      message: "Dados atualizados com sucesso.",
      provider: mapProviderAccount(updated)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao atualizar dados do prestador." });
  }
});
app.get("/api/quotes/active", async (_req, res) => {
  try {
    const providerId = _req.authProvider.id;
    const draft = await ensureDraftQuote(providerId);
    const quote = await getQuoteById(providerId, draft.id);
    res.json(mapQuote(quote));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar orcamento ativo." });
  }
});

app.post("/api/quotes/active/reset", async (_req, res) => {
  try {
    const providerId = _req.authProvider.id;
    const quote = await prisma.quote.create({
      data: {
        providerId,
        title: "Novo projeto",
        pricingTier: "PADRAO"
      },
      include: {
        client: true,
        items: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }]
        }
      }
    });

    res.status(201).json(mapQuote(quote));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao criar novo orcamento." });
  }
});

app.get("/api/quotes/history", async (_req, res) => {
  try {
    const providerId = _req.authProvider.id;
    const quotes = await prisma.quote.findMany({
      where: {
        providerId,
        status: {
          not: "DRAFT"
        }
      },
      include: {
        client: true,
        items: true
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 100
    });

    res.json(quotes.map(mapQuoteHistory));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar historico de orcamentos." });
  }
});

app.post("/api/quotes/:quoteId/reopen", async (req, res) => {
  const providerId = req.authProvider.id;
  const quoteId = parseId(req.params.quoteId);
  if (!quoteId) {
    return res.status(400).json({ message: "Orcamento invalido." });
  }

  try {
    const quote = await getQuoteById(providerId, quoteId);
    if (!quote) {
      return res.status(404).json({ message: "Orcamento nao encontrado." });
    }

    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: "DRAFT"
      },
      include: {
        client: true,
        items: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }]
        }
      }
    });

    res.json(mapQuote(updated));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao reabrir orcamento para edicao." });
  }
});

app.delete("/api/quotes/:quoteId", async (req, res) => {
  const providerId = req.authProvider.id;
  const quoteId = parseId(req.params.quoteId);
  if (!quoteId) {
    return res.status(400).json({ message: "Orcamento invalido." });
  }

  try {
    const quote = await getQuoteById(providerId, quoteId);
    if (!quote) {
      return res.status(404).json({ message: "Orcamento nao encontrado." });
    }

    await prisma.quote.delete({
      where: { id: quoteId }
    });

    res.json({ message: "Orcamento excluido com sucesso." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao excluir orcamento." });
  }
});

app.get("/api/management/overview", async (_req, res) => {
  try {
    const providerId = _req.authProvider.id;
    const now = new Date();

    const [quotes, schedule] = await Promise.all([
      prisma.quote.findMany({
        where: {
          providerId,
          clientId: {
            not: null
          },
          status: {
            not: "DRAFT"
          }
        },
        include: {
          client: true,
          items: true
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
      }),
      buildMajorEventSchedule(now)
    ]);

    const nextEvent = nextUpcomingEvent(schedule, now);
    const acceptedStatus = new Set(["APPROVED", "COMPLETED"]);
    const records = quotes.map((quote) => mapManagementQuoteRecord(quote, nextEvent));

    const completedProjects = records.filter((record) => record.status === "COMPLETED");
    const eventsPack = records.filter(
      (record) => record.eventsPackContracted && acceptedStatus.has(record.status)
    );
    const frontendSupport = records.filter(
      (record) =>
        record.frontendSupportContracted &&
        !record.backendSupportContracted &&
        acceptedStatus.has(record.status)
    );
    const fullstackSupport = records.filter(
      (record) =>
        record.frontendSupportContracted &&
        record.backendSupportContracted &&
        acceptedStatus.has(record.status)
    );

    res.json({
      serverTime: now,
      supportChargeValue: SUPPORT_CHARGE_VALUE,
      fullstackChargeValue: FULLSTACK_CHARGE_VALUE,
      nextEvent: nextEvent
        ? {
            key: nextEvent.key,
            label: nextEvent.label,
            date: nextEvent.date,
            triggerDate: shiftUtcDays(nextEvent.date, -EVENT_REMINDER_LOOKAHEAD_DAYS)
          }
        : null,
      completedProjects,
      eventsPack,
      frontendSupport,
      fullstackSupport
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar painel de gestao." });
  }
});

app.patch("/api/management/quotes/:quoteId/billing", async (_req, res) => {
  const providerId = _req.authProvider.id;
  const quoteId = parseId(_req.params.quoteId);
  if (!quoteId) {
    return res.status(400).json({ message: "Orcamento invalido." });
  }

  const data = {};
  if (Object.prototype.hasOwnProperty.call(_req.body, "frontendBillingStatus")) {
    const status = normalizeText(_req.body.frontendBillingStatus).toUpperCase();
    if (!BILLING_STATUSES.has(status)) {
      return res.status(400).json({ message: "Status de cobranca de front-end invalido." });
    }
    data.frontendBillingStatus = status;
  }

  if (Object.prototype.hasOwnProperty.call(_req.body, "fullstackBillingStatus")) {
    const status = normalizeText(_req.body.fullstackBillingStatus).toUpperCase();
    if (!BILLING_STATUSES.has(status)) {
      return res.status(400).json({ message: "Status de cobranca de full-stack invalido." });
    }
    data.fullstackBillingStatus = status;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "Nenhuma alteracao de cobranca enviada." });
  }

  try {
    const existing = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        providerId
      }
    });
    if (!existing) {
      return res.status(404).json({ message: "Orcamento nao encontrado." });
    }

    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data,
      include: {
        client: true,
        items: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }]
        }
      }
    });

    res.json(mapQuote(updated));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao atualizar status de cobranca." });
  }
});

app.get("/api/quotes/:quoteId", async (req, res) => {
  const providerId = req.authProvider.id;
  const quoteId = parseId(req.params.quoteId);
  if (!quoteId) {
    return res.status(400).json({ message: "Orcamento invalido." });
  }

  try {
    const quote = await getQuoteById(providerId, quoteId);
    if (!quote) {
      return res.status(404).json({ message: "Orcamento nao encontrado." });
    }

    res.json(mapQuote(quote));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar orcamento." });
  }
});

app.patch("/api/quotes/:quoteId/config", async (req, res) => {
  const providerId = req.authProvider.id;
  const quoteId = parseId(req.params.quoteId);
  if (!quoteId) {
    return res.status(400).json({ message: "Orcamento invalido." });
  }

  const data = {};
  const hasClientName = Object.prototype.hasOwnProperty.call(req.body, "clientName");
  const requestedClientName = hasClientName ? normalizeText(req.body.clientName) : null;

  if (Object.prototype.hasOwnProperty.call(req.body, "title")) {
    const title = normalizeText(req.body.title);
    if (!title) {
      return res.status(400).json({ message: "Titulo do projeto e obrigatorio." });
    }
    data.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
    const notes = normalizeText(req.body.notes);
    data.notes = notes || null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "clientId")) {
    const rawClientId = req.body.clientId;
    if (rawClientId === null || rawClientId === "" || Number(rawClientId) === 0) {
      data.clientId = null;
      data.clientName = requestedClientName || null;
    } else {
      const clientId = parseId(rawClientId);
      if (!clientId) {
        return res.status(400).json({ message: "Cliente invalido." });
      }
      const client = await prisma.client.findFirst({
        where: {
          id: clientId,
          providerId
        }
      });
      if (!client) {
        return res.status(404).json({ message: "Cliente nao encontrado." });
      }
      data.clientId = client.id;
      data.clientName = requestedClientName || client.name || null;
    }
  }

  if (hasClientName && !Object.prototype.hasOwnProperty.call(req.body, "clientId")) {
    data.clientName = requestedClientName || null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "paymentMethod")) {
    const paymentMethod = normalizeText(req.body.paymentMethod).toUpperCase();
    if (!PAYMENT_METHODS.has(paymentMethod)) {
      return res.status(400).json({ message: "Forma de pagamento invalida." });
    }
    data.paymentMethod = paymentMethod;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "installments")) {
    const installments = Number(req.body.installments);
    if (!Number.isInteger(installments) || installments < 1 || installments > 24) {
      return res.status(400).json({ message: "Parcelas devem estar entre 1 e 24." });
    }
    data.installments = installments;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "pricingTier")) {
    const pricingTier = normalizeText(req.body.pricingTier).toUpperCase();
    if (!PRICING_TIERS.has(pricingTier)) {
      return res.status(400).json({ message: "Faixa de preco invalida." });
    }
    data.pricingTier = pricingTier;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "adjustmentPercent")) {
    const adjustmentPercentPoints = toPercentPoints(req.body.adjustmentPercent);
    if (
      !Number.isFinite(adjustmentPercentPoints) ||
      adjustmentPercentPoints < -8000 ||
      adjustmentPercentPoints > 20000
    ) {
      return res.status(400).json({ message: "Ajuste manual invalido. Use um numero entre -80 e 200 (ex: 49.79)." });
    }
    data.adjustmentPercentPoints = adjustmentPercentPoints;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "discountPercent")) {
    const discountPercentPoints = toPercentPoints(req.body.discountPercent);
    if (
      !Number.isFinite(discountPercentPoints) ||
      discountPercentPoints < 0 ||
      discountPercentPoints > 8000
    ) {
      return res.status(400).json({ message: "Desconto invalido. Use um numero entre 0 e 80 (ex: 49.79)." });
    }
    data.discountPercentPoints = discountPercentPoints;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "hasMachineFee")) {
    data.hasMachineFee = Boolean(req.body.hasMachineFee);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "machineFeePercent")) {
    const machineFeePercentPoints = toPercentPoints(req.body.machineFeePercent);
    if (
      !Number.isFinite(machineFeePercentPoints) ||
      machineFeePercentPoints < 0 ||
      machineFeePercentPoints > 10000
    ) {
      return res.status(400).json({ message: "Taxa da maquininha invalida. Use um numero entre 0 e 100 (ex: 9.64)." });
    }
    data.machineFeePercentPoints = machineFeePercentPoints;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "passMachineFeeToClient")) {
    data.passMachineFeeToClient = Boolean(req.body.passMachineFeeToClient);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "monthlyPlanContracted")) {
    data.monthlyPlanContracted = Boolean(req.body.monthlyPlanContracted);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "eventsPackContracted")) {
    data.eventsPackContracted = Boolean(req.body.eventsPackContracted);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "backendSupportContracted")) {
    data.backendSupportContracted = Boolean(req.body.backendSupportContracted);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "frontendSupportContracted")) {
    data.frontendSupportContracted = Boolean(req.body.frontendSupportContracted);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "frontendBillingStatus")) {
    const frontendBillingStatus = normalizeText(req.body.frontendBillingStatus).toUpperCase();
    if (!BILLING_STATUSES.has(frontendBillingStatus)) {
      return res.status(400).json({ message: "Status de cobranca do front-end invalido." });
    }
    data.frontendBillingStatus = frontendBillingStatus;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "fullstackBillingStatus")) {
    const fullstackBillingStatus = normalizeText(req.body.fullstackBillingStatus).toUpperCase();
    if (!BILLING_STATUSES.has(fullstackBillingStatus)) {
      return res.status(400).json({ message: "Status de cobranca do full-stack invalido." });
    }
    data.fullstackBillingStatus = fullstackBillingStatus;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeText(req.body.status).toUpperCase();
    if (!QUOTE_STATUSES.has(status)) {
      return res.status(400).json({ message: "Status invalido." });
    }
    data.status = status;
  }

  try {
    const quote = await getQuoteById(providerId, quoteId);
    if (!quote) {
      return res.status(404).json({ message: "Orcamento nao encontrado." });
    }

    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data,
      include: {
        client: true,
        items: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }]
        }
      }
    });

    res.json(mapQuote(updated));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao atualizar configuracoes do orcamento." });
  }
});

app.post("/api/quotes/:quoteId/items", async (req, res) => {
  const providerId = req.authProvider.id;
  const quoteId = parseId(req.params.quoteId);
  const catalogItemId = parseId(req.body.catalogItemId);
  const quantityToAdd = Number(req.body.quantity || 1);

  if (!quoteId || !catalogItemId) {
    return res.status(400).json({ message: "Orcamento ou item invalido." });
  }

  if (!Number.isInteger(quantityToAdd) || quantityToAdd <= 0) {
    return res.status(400).json({ message: "Quantidade para adicionar e invalida." });
  }

  try {
    const quote = await getQuoteById(providerId, quoteId);
    if (!quote) {
      return res.status(404).json({ message: "Orcamento nao encontrado." });
    }

    const catalogItem = await prisma.catalogItem.findFirst({
      where: {
        id: catalogItemId,
        providerId
      }
    });

    if (!catalogItem || !catalogItem.active) {
      return res.status(404).json({ message: "Item de catalogo nao encontrado." });
    }

    const existingItem = await prisma.quoteItem.findFirst({
      where: {
        quoteId,
        catalogItemId
      }
    });

    if (existingItem) {
      const quantity = existingItem.quantity + quantityToAdd;
      await prisma.quoteItem.update({
        where: { id: existingItem.id },
        data: {
          quantity,
          lineTotalCents: quantity * existingItem.unitPriceCents
        }
      });
    } else {
      await prisma.quoteItem.create({
        data: {
          quoteId,
          catalogItemId,
          nameSnapshot: catalogItem.name,
          categorySnapshot: catalogItem.category,
          unitPriceCents: catalogItem.priceCents,
          estimatedDays: catalogItem.estimatedDays,
          quantity: quantityToAdd,
          lineTotalCents: quantityToAdd * catalogItem.priceCents
        }
      });
    }

    await touchQuote(providerId, quoteId);
    const updatedQuote = await getQuoteById(providerId, quoteId);
    res.status(201).json(mapQuote(updatedQuote));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao adicionar item no orcamento." });
  }
});
app.patch("/api/quotes/:quoteId/items/:itemId", async (req, res) => {
  const providerId = req.authProvider.id;
  const quoteId = parseId(req.params.quoteId);
  const itemId = parseId(req.params.itemId);

  if (!quoteId || !itemId) {
    return res.status(400).json({ message: "Orcamento ou item invalido." });
  }

  try {
    const item = await prisma.quoteItem.findFirst({
      where: {
        id: itemId,
        quoteId,
        quote: {
          providerId
        }
      }
    });

    if (!item) {
      return res.status(404).json({ message: "Item nao encontrado neste orcamento." });
    }

    const updates = {};
    const quantityValue = req.body.quantity;
    const unitPriceValue = req.body.unitPrice;
    const unitPriceCentsValue = req.body.unitPriceCents;
    const estimatedDaysValue = req.body.estimatedDays;

    if (quantityValue !== undefined) {
      const quantity = Number(quantityValue);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ message: "Quantidade deve ser >= 1." });
      }
      updates.quantity = quantity;
    }

    if (unitPriceValue !== undefined && unitPriceCentsValue !== undefined) {
      return res.status(400).json({ message: "Informe apenas um dos campos: unitPrice ou unitPriceCents." });
    }

    if (unitPriceValue !== undefined) {
      const unitPrice = Number(unitPriceValue);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ message: "Valor unitario invalido." });
      }
      updates.unitPriceCents = toCents(unitPrice);
    } else if (unitPriceCentsValue !== undefined) {
      const unitPriceCents = Number(unitPriceCentsValue);
      if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
        return res.status(400).json({ message: "Valor unitario invalido." });
      }
      updates.unitPriceCents = Math.round(unitPriceCents);
    }

    if (estimatedDaysValue !== undefined) {
      const estimatedDays = Number(estimatedDaysValue);
      if (!Number.isInteger(estimatedDays) || estimatedDays < 1) {
        return res.status(400).json({ message: "Prazo deve ser >= 1." });
      }
      updates.estimatedDays = estimatedDays;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "Nenhuma alteracao informada." });
    }

    const finalQuantity = updates.quantity ?? item.quantity;
    const finalUnitPriceCents = updates.unitPriceCents ?? item.unitPriceCents;

    await prisma.quoteItem.update({
      where: { id: itemId },
      data: {
        ...updates,
        lineTotalCents: finalQuantity * finalUnitPriceCents
      }
    });

    await touchQuote(providerId, quoteId);
    const updatedQuote = await getQuoteById(providerId, quoteId);
    res.json(mapQuote(updatedQuote));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao atualizar item do orcamento." });
  }
});

app.delete("/api/quotes/:quoteId/items/:itemId", async (req, res) => {
  const providerId = req.authProvider.id;
  const quoteId = parseId(req.params.quoteId);
  const itemId = parseId(req.params.itemId);

  if (!quoteId || !itemId) {
    return res.status(400).json({ message: "Orcamento ou item invalido." });
  }

  try {
    const item = await prisma.quoteItem.findFirst({
      where: {
        id: itemId,
        quoteId,
        quote: {
          providerId
        }
      }
    });

    if (!item) {
      return res.status(404).json({ message: "Item nao encontrado neste orcamento." });
    }

    await prisma.quoteItem.delete({
      where: { id: itemId }
    });

    await touchQuote(providerId, quoteId);
    const updatedQuote = await getQuoteById(providerId, quoteId);
    res.json(mapQuote(updatedQuote));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao remover item do orcamento." });
  }
});

app.post("/api/quotes/:quoteId/finalize", async (req, res) => {
  const providerId = req.authProvider.id;
  const quoteId = parseId(req.params.quoteId);
  const status = normalizeText(req.body.status).toUpperCase() || "SENT";

  if (!quoteId) {
    return res.status(400).json({ message: "Orcamento invalido." });
  }

  if (!QUOTE_STATUSES.has(status) || status === "DRAFT") {
    return res.status(400).json({ message: "Status de finalizacao invalido." });
  }

  try {
    const quote = await getQuoteById(providerId, quoteId);
    if (!quote) {
      return res.status(404).json({ message: "Orcamento nao encontrado." });
    }

    if (quote.items.length === 0) {
      return res.status(400).json({ message: "Adicione itens antes de finalizar." });
    }

    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status
      },
      include: {
        client: true,
        items: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }]
        }
      }
    });

    res.json(mapQuote(updated));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao finalizar orcamento." });
  }
});

app.get("/api/summary/quotes", async (_req, res) => {
  try {
    const providerId = _req.authProvider.id;
    const quotes = await prisma.quote.findMany({
      where: {
        providerId,
        status: {
          not: "DRAFT"
        }
      },
      include: {
        items: true
      }
    });

    const summary = quotes.reduce(
      (acc, quote) => {
        const totals = calculateQuoteTotals(quote);
        acc.totalQuotes += 1;
        acc.totalToCharge += totals.totalToCharge;
        acc.totalNet += totals.netAmount;
        acc.totalMachineFee += totals.machineFee;

        if (quote.status === "APPROVED") {
          acc.approved += 1;
        }
        if (quote.status === "COMPLETED") {
          acc.completed += 1;
        }
        if (quote.status === "REJECTED") {
          acc.rejected += 1;
        }
        if (quote.status === "SENT") {
          acc.sent += 1;
        }

        return acc;
      },
      {
        totalQuotes: 0,
        approved: 0,
        completed: 0,
        rejected: 0,
        sent: 0,
        totalToCharge: 0,
        totalNet: 0,
        totalMachineFee: 0
      }
    );

    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao carregar resumo." });
  }
});

async function start() {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor ativo em http://0.0.0.0:${PORT}`);
  });
  runEventReminderTick(true).catch((error) => {
    console.error("Falha no primeiro ciclo de lembretes:", error.message);
  });
  setInterval(() => {
    runEventReminderTick(false).catch((error) => {
      console.error("Falha no ciclo de lembretes:", error.message);
    });
  }, 1000);
}

start().catch((error) => {
  console.error("Falha ao iniciar aplicacao:", error);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
