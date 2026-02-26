FROM mcr.microsoft.com/playwright:v1.40.1-jammy

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

ENV PORT=8080
ENV PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1

EXPOSE 8080
CMD ["npx", "tsx", "src/server.ts"]
