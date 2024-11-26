const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const mime = require("mime-types");
const dotenv = require("dotenv");
const Redis = require("ioredis");

dotenv.config();
const serviceUri =`${process.env.AIVEN_KEY}`
const publisher = new Redis(serviceUri);

function publishLog(log) {
  publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }));
}

const s3Client = new S3Client({
  region: process.env.BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_KEY,
  },
});

const PROJECT_ID = process.env.PROJECT_ID;
async function init() {
  console.log("Executing the build script ");
  publishLog("build started");
  const outDir = path.join(__dirname, "output");

  const p = exec(`cd ${outDir} && npm install && npm run build`);

  p.stdout.on("data", function (data) {
    console.log(data.toString());
    publishLog(data.toString());
  });

  p.stdout.on("error", function (data) {
    console.log(data.toString());
    publishLog("ERROR  " + data.toString());
  });

  p.stdout.on("close", async function () {
    console.log("Building complete !!");
    publishLog("build complete");

    const distFolderPath = path.join(__dirname, "output", "dist");
    const distFolderContent = fs.readdirSync(distFolderPath, {
      recursive: true,
    });

    try {
      for (const file of distFolderContent) {
        const filePath = path.join(distFolderPath, file);
        if (fs.lstatSync(filePath).isDirectory()) continue;

        console.log("uploading filepath : ", filePath);
        publishLog(`uploading filepath : ${filePath}`);
        const command = new PutObjectCommand({
          Bucket: process.env.BUCKET_NAME,
          Key: `__outputs/${PROJECT_ID}/${file}`,
          Body: fs.createReadStream(filePath),
          ContentType: mime.lookup(filePath),
        });

        await s3Client.send(command);
        console.log("done uploaded the file  : ", filePath);
        publishLog(`done uploaded the file  : ${filePath}`);
      }

      console.log("Done ... ");
      publishLog("done ....");
      await publisher.disconnect();
    } catch (e) {
      console.log("Error : ", e);
      publishLog("Error : " + e);
      await publisher.disconnect();
      process.exit(1);
    }
  });
}

init();
