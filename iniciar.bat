@echo off
echo 🚀 Iniciando Painel de Orçamentos...
echo.

echo 📦 Instalando dependências...
call npm install

echo.
echo 🗄️ Configurando banco de dados...
call npm run prisma:generate
call npm run prisma:seed

echo.
echo ✅ Configuração concluída!
echo.
echo 🌐 Iniciando servidor...
echo 📍 Acesse: http://localhost:3000
echo.

call npm start