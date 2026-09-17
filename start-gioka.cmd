@echo off
title Gioka - Servidor
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
  call npm run build
)
if not exist client\dist (
  call npm run build
)
start "" http://localhost:3001
npm start
