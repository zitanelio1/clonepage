FROM node:18-slim

# Instalar dependências mínimas para o Chromium funcionar
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libgbm1 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxrender1 \
    libxtst6 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Definir diretório de trabalho
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package.json package-lock.json ./

# Instalar dependências e instalar Chromium na versão específica
RUN npm install && \
    npx @puppeteer/browsers install chrome@127.0.6533.88 --path /app/.cache/puppeteer && \
    ls -la /app/.cache/puppeteer/chrome || echo "Chromium não encontrado no cache após instalação" && \
    chmod -R 755 /app/.cache/puppeteer/chrome

# Copiar o restante do código
COPY . .

# Definir variável de ambiente para o Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/app/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome

# Expor a porta
EXPOSE 3000

# Iniciar o servidor
CMD ["npm", "start"]
