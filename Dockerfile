FROM node:18-slim

# Instalar dependências necessárias para o Chromium e Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
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
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/chromium /usr/bin/chromium-browser || true  # Criar link simbólico, se necessário

# Verificar se o Chromium está instalado
RUN which chromium || echo "Chromium não encontrado" && chromium --version || echo "Erro ao executar Chromium"

# Definir variável de ambiente para o caminho do Chromium
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium

# Definir diretório de trabalho
WORKDIR /app

# Copiar package.json e instalar dependências Node.js
COPY package.json package-lock.json* ./
RUN npm install

# Copiar o restante do código
COPY . .

# Expor a porta
EXPOSE 3000

# Iniciar o servidor
CMD ["npm", "start"]
