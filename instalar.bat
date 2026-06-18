@echo off
echo ========================================
echo INSTALACAO DO SISTEMA DE AUTENTICACAO
echo ========================================
echo.

echo [1/3] Executando migracao do banco de dados...
call npx prisma migrate dev --name provider_complete_profile
if errorlevel 1 (
    echo ERRO: Falha na migracao do banco de dados
    pause
    exit /b 1
)
echo.

echo [2/3] Gerando Prisma Client...
call npx prisma generate
if errorlevel 1 (
    echo ERRO: Falha ao gerar Prisma Client
    pause
    exit /b 1
)
echo.

echo [3/3] Instalacao concluida!
echo.
echo ========================================
echo PROXIMOS PASSOS:
echo ========================================
echo.
echo 1. Leia o arquivo INSTRUCOES_INTEGRACAO.md
echo 2. Integre o HTML da sidebar (sidebar-html.txt)
echo 3. Integre o CSS da sidebar (sidebar-styles.css)
echo 4. Integre o JavaScript (app-additions.js)
echo 5. Execute: npm start
echo 6. Acesse: http://localhost:3000/login.html
echo.
echo ========================================
pause
