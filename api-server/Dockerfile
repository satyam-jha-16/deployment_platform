FROM node:20-alpine
WORKDIR /app

COPY package* .
RUN npm install 

COPY . . 
EXPOSE 9000
CMD ["node", "index.js"]
