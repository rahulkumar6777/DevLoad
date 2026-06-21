FROM node:24

WORKDIR /app

RUN apt-get update && \
    apt-get install -y clamav clamav-daemon && \
    rm -rf /var/lib/apt/lists/*


RUN freshclam

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 6700

CMD service clamav-daemon start && npm start
