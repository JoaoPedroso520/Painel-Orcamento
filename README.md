# Painel Freelancer de Orçamentos (HTML + CSS + JS + Prisma)

Aplicação completa para montar propostas e gerenciar clientes com sistema de autenticação e banco de dados.

## 🚀 Funcionalidades principais

### Autenticação e Perfil
- Sistema de login e cadastro com autenticação segura
- Cadastro completo do prestador (nome, email, telefone, CNPJ, endereço, cidade)
- Sessão segura com token de autenticação
- Dados do prestador utilizados automaticamente nos contratos

### Catálogo de Serviços
- Criação, edição e exclusão de serviços
- Categorias e tipos de serviço (Projeto base, Módulo, Funcionalidade, Integração, Suporte)
- Valores de referência baseados no mercado freelance brasileiro
- Prazos estimados por serviço
- Busca e filtragem de serviços

### Orçamentos
- Montagem de orçamento por clique
- Adição de itens com quantidade ajustável
- Edição de quantidade mesmo após finalizar
- Vinculação com cliente cadastrado
- Observações e notas por orçamento

### Precificação Inteligente
- Três faixas de preço (MVP, Padrão, Robusto)
- Ajuste manual percentual
- Sistema de desconto
- Cálculo de taxa da maquininha
- Opção de repassar taxa ao cliente
- Parcelamento configurável

### Gestão de Clientes
- Cadastro completo (nome, empresa, email, telefone, CPF/CNPJ)
- Endereço completo (CEP, estado, cidade, bairro, rua, número, complemento)
- Data de aniversário
- Observações personalizadas
- Busca por nome, email, telefone ou documento
- Histórico de orçamentos por cliente
- Estatísticas (total de orçamentos, aprovados, valor total, ticket médio)

### Interface Moderna
- Design responsivo e moderno
- Tema claro e escuro
- Animações suaves
- Feedback visual (toasts)
- Experiência mobile-first

## 🛠️ Tecnologias

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js + Express
- **Banco de Dados**: SQLite + Prisma ORM
- **Autenticação**: JWT com hash seguro de senhas

## 📦 Instalação e Configuração

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar banco de dados
```bash
npm run setup
```

Este comando irá:
- Gerar o cliente Prisma
- Executar as migrações do banco
- Popular o banco com dados iniciais

### 3. Iniciar a aplicação
```bash
npm start
```

### 4. Acessar o sistema
- Abra o navegador em: `http://localhost:3000`
- Crie sua conta de prestador na primeira vez
- Faça login e comece a usar!

## 🎯 Como usar

### Primeiro acesso
1. Acesse `http://localhost:3000`
2. Clique em "Criar conta" se não tiver acesso
3. Preencha todos os dados do cadastro
4. Faça login com suas credenciais
5. Seus dados serão usados automaticamente nos contratos

### Fluxo básico
1. **Dashboard**: Visualize estatísticas e gerencie orçamento atual
2. **Catálogo**: Adicione seus serviços com preços e prazos
3. **Clientes**: Cadastre clientes com dados completos
4. **Orçamentos**: Monte propostas adicionando serviços do catálogo
5. **Histórico**: Acompanhe orçamentos enviados e aprovados

## 🗂️ Estrutura do Projeto

```
Projeto-site-02/
├── prisma/
│   ├── migrations/     # Migrações do banco
│   ├── schema.prisma   # Schema do banco
│   └── seed.js         # Dados iniciais
├── public/
│   ├── assets/
│   │   ├── app-prisma.js    # JavaScript principal
│   │   ├── new-styles.css   # Estilos principais
│   │   └── login.css        # Estilos do login
│   ├── index.html           # Página principal
│   └── login.html           # Página de login
├── server.js           # Servidor Express + API
├── package.json        # Dependências
└── README.md          # Este arquivo
```

## 🔧 Scripts disponíveis

- `npm start` - Inicia o servidor
- `npm run dev` - Inicia em modo desenvolvimento
- `npm run setup` - Configura banco completo (migrate + seed)
- `npm run prisma:generate` - Gera cliente Prisma
- `npm run prisma:migrate` - Executa migrações
- `npm run prisma:seed` - Popula dados iniciais
- `npm run prisma:studio` - Abre interface visual do banco
npx prisma migrate dev --name add-email-provider
npx prisma db push
## 🌟 Recursos avançados

- **Persistência**: Todos os dados são salvos no banco SQLite
- **Segurança**: Senhas com hash + salt, tokens JWT seguros
- **Performance**: Índices otimizados, queries eficientes
- **Escalabilidade**: Arquitetura preparada para crescimento
- **Manutenibilidade**: Código limpo e bem estruturado

## 🚨 Importante

- O banco SQLite é criado automaticamente em `prisma/dev.db`
- Faça backup regular do arquivo de banco
- Para produção, considere migrar para PostgreSQL ou MySQL
- Mantenha o arquivo `.env` seguro (não commitar)

## 📞 Suporte

Se encontrar problemas:
1. Verifique se todas as dependências foram instaladas
2. Execute `npm run setup` novamente
3. Verifique os logs do servidor no terminal
4. Consulte a documentação do Prisma se necessário
