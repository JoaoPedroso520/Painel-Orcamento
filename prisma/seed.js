const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DEFAULT_CATALOG_ITEMS = [
  {
    name: "Landing page de conversão",
    category: "Projeto base",
    description: "Inclui briefing, estrutura de copy, formulário integrado, SEO on-page inicial e publicação.",
    type: "BASE_PROJECT",
    priceCents: 280000,
    estimatedDays: 14
  },
  {
    name: "Site institucional completo",
    category: "Projeto base", 
    description: "Site corporativo com até 10 páginas, formulário, mapa, blog básico e painel para ajustes simples.",
    type: "BASE_PROJECT",
    priceCents: 520000,
    estimatedDays: 35
  },
  {
    name: "E-commerce completo",
    category: "Projeto base",
    description: "Loja virtual com catálogo, carrinho, checkout, área do cliente e configuração inicial de frete/pagamento.",
    type: "BASE_PROJECT", 
    priceCents: 1450000,
    estimatedDays: 84
  },
  {
    name: "Sistema de login",
    category: "Funcionalidades",
    description: "Sistema completo de autenticação com registro, login, recuperação de senha e área restrita.",
    type: "FEATURE",
    priceCents: 80000,
    estimatedDays: 5
  },
  {
    name: "Integração de pagamento",
    category: "Integrações",
    description: "Integração com gateway de pagamento (PIX, boleto e cartão) com callbacks e conciliação básica.",
    type: "INTEGRATION",
    priceCents: 120000,
    estimatedDays: 7
  },
  {
    name: "Painel administrativo",
    category: "Módulos",
    description: "Painel completo para gestão de conteúdo, usuários e configurações do sistema.",
    type: "MODULE",
    priceCents: 180000,
    estimatedDays: 12
  },
  {
    name: "SEO técnico inicial",
    category: "Suporte",
    description: "Otimização técnica para mecanismos de busca, sitemap, metadados e estrutura de URLs.",
    type: "SUPPORT",
    priceCents: 60000,
    estimatedDays: 5
  },
  {
    name: "Deploy e hospedagem",
    category: "Suporte", 
    description: "Configuração de servidor, domínio, SSL e publicação do projeto em produção.",
    type: "SUPPORT",
    priceCents: 40000,
    estimatedDays: 3
  }
];

async function seedDatabase() {
  try {
    console.log('🌱 Iniciando seed do banco de dados...');

    // Verificar se já existem itens no catálogo
    const existingItems = await prisma.catalogItem.count();
    
    if (existingItems === 0) {
      console.log('📦 Criando itens padrão do catálogo...');
      
      for (const item of DEFAULT_CATALOG_ITEMS) {
        await prisma.catalogItem.create({
          data: {
            ...item,
            active: true
          }
        });
      }
      
      console.log(`✅ ${DEFAULT_CATALOG_ITEMS.length} itens criados no catálogo`);
    } else {
      console.log('📦 Catálogo já possui itens, pulando seed...');
    }

    console.log('🎉 Seed concluído com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro durante o seed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar seed se chamado diretamente
if (require.main === module) {
  seedDatabase()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { seedDatabase };