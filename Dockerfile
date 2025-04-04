FROM node:18

# Instalar Chromium e dependências necessárias
RUN apt-get update && apt-get install -y \
    chromium \
    libxss1 \
    libxtst6 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Definir o diretório de trabalho
WORKDIR /app

# Copiar package.json e instalar dependências
COPY package.json package-lock.json* ./
RUN npm install

# Copiar o restante do código
COPY . .

# Definir a porta
EXPOSE 3000

# Iniciar o servidor
CMD ["npm", "start"]
