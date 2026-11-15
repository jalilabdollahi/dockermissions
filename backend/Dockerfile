FROM node:22-alpine
RUN apk add --no-cache docker-cli python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["npm", "run", "dev"]
