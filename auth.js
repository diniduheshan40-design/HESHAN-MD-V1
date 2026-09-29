const fs = require("fs");
const path = require("path");
const pino = require("pino");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const mongoose = require("mongoose");

const logger = pino({
  level:"silent"
});

const sessionDir =
  path.join(__dirname,"session");

let activeSocket = null;
let reconnectTimer = null;
let backupRunning = false;
let backupAgain = false;

/* =========================================================
   MONGODB SESSION MODEL
========================================================= */

const SessionSchema =
  new mongoose.Schema(
    {
      sessionId:{
        type:String,
        unique:true,
        required:true
      },

      files:{
        type:Map,
        of:String,
        default:{}
      }

    },
    {
      timestamps:true
    }
  );

const SessionModel =
  mongoose.models.DarkDinuSession ||
  mongoose.model(
    "DarkDinuSession",
    SessionSchema
  );

/* =========================================================
   SESSION DIRECTORY
========================================================= */

function ensureSessionDir(){

  if(!fs.existsSync(sessionDir)){

    fs.mkdirSync(
      sessionDir,
      {
        recursive:true
      }
    );

  }

}

/* =========================================================
   DELETE SESSION
========================================================= */

function deleteSessionDir(){

  if(fs.existsSync(sessionDir)){

    fs.rmSync(
      sessionDir,
      {
        recursive:true,
        force:true
      }
    );

  }

}

/* =========================================================
   RESTORE MONGODB SESSION
========================================================= */

async function restoreCredentials(){

  ensureSessionDir();

  try{

    const data =
      await SessionModel.findOne({
        sessionId:"dark_dinu_session"
      }).lean();

    if(!data || !data.files){

      console.log(
        "ℹ️ No MongoDB WhatsApp session found"
      );

      return false;

    }

    deleteSessionDir();

    ensureSessionDir();

    const files =
      data.files instanceof Map
        ? Object.fromEntries(data.files)
        : data.files;

    let count = 0;

    for(
      const [fileName,content]
      of Object.entries(files)
    ){

      const filePath =
        path.join(
          sessionDir,
          fileName
        );

      const directory =
        path.dirname(filePath);

      if(!fs.existsSync(directory)){

        fs.mkdirSync(
          directory,
          {
            recursive:true
          }
        );

      }

      fs.writeFileSync(
        filePath,
        content,
        "utf8"
      );

      count++;

    }

    console.log(
      `✅ Restored ${count} session files from MongoDB`
    );

    return true;

  }catch(error){

    console.error(
      "❌ MongoDB restore error:",
      error
    );

    return false;

  }

}

/* =========================================================
   BACKUP SESSION TO MONGODB
========================================================= */

async function backupCredentials(){

  if(backupRunning){

    backupAgain = true;

    return;

  }

  backupRunning = true;

  try{

    ensureSessionDir();

    const files = {};

    const allFiles =
      fs.readdirSync(
        sessionDir
      );

    for(
      const fileName
      of allFiles
    ){

      const filePath =
        path.join(
          sessionDir,
          fileName
        );

      if(
        fs.existsSync(filePath) &&
        fs.statSync(filePath).isFile()
      ){

        files[fileName] =
          fs.readFileSync(
            filePath,
            "utf8"
          );

      }

    }

    if(
      Object.keys(files).length === 0
    ){

      return;

    }

    await SessionModel.findOneAndUpdate(

      {
        sessionId:
          "dark_dinu_session"
      },

      {
        $set:{
          files
        }
      },

      {
        upsert:true,
        new:true
      }

    );

    console.log(
      "💾 WhatsApp session backed up to MongoDB"
    );

  }catch(error){

    console.error(
      "❌ MongoDB backup error:",
      error.message
    );

  }finally{

    backupRunning = false;

    if(backupAgain){

      backupAgain = false;

      setTimeout(
        backupCredentials,
        1000
      );

    }

  }

}

/* =========================================================
   CREATE WHATSAPP SOCKET
========================================================= */

async function createSocket(
  state,
  saveCreds
){

  const {
    version
  } =
    await fetchLatestBaileysVersion();

  console.log(
    "📦 Baileys version:",
    version.join(".")
  );

  const sock =
    makeWASocket({

      version,

      logger,

      auth:{
        creds:state.creds,

        keys:
          makeCacheableSignalKeyStore(
            state.keys,
            logger
          )
      },

      browser:
        Browsers.macOS(
          "Chrome"
        ),

      printQRInTerminal:false,

      syncFullHistory:false,

      markOnlineOnConnect:false,

      generateHighQualityLinkPreview:false,

      connectTimeoutMs:60000,

      keepAliveIntervalMs:15000,

      defaultQueryTimeoutMs:60000,

      retryRequestDelayMs:2000,

      emitOwnEvents:false,

      fireInitQueries:true

    });

  activeSocket = sock;

  /* =======================================================
     CREDENTIAL UPDATES
  ======================================================= */

  sock.ev.on(
    "creds.update",
    async ()=>{
      try{

        await saveCreds();

        setTimeout(
          backupCredentials,
          1000
        );

      }catch(error){

        console.error(
          "❌ Save creds error:",
          error.message
        );

      }
    }
  );

  /* =======================================================
     CONNECTION UPDATE
  ======================================================= */

  sock.ev.on(
    "connection.update",
    async(update)=>{

      const {
        connection,
        lastDisconnect
      } = update;

      if(connection === "connecting"){

        console.log(
          "🔄 WhatsApp connecting..."
        );

      }

      if(connection === "open"){

        console.log(
          "✅ WhatsApp connection OPEN"
        );

        await backupCredentials();

      }

      if(connection === "close"){

        const statusCode =
          lastDisconnect
            ?.error
            ?.output
            ?.statusCode;

        console.log(
          "⚠️ WhatsApp connection closed."
        );

        console.log(
          "Status:",
          statusCode
        );

        if(
          statusCode ===
          DisconnectReason.loggedOut
        ){

          console.log(
            "🚪 WhatsApp logged out."
          );

          return;

        }

        if(
          statusCode ===
          DisconnectReason.badSession
        ){

          console.log(
            "❌ Bad WhatsApp session."
          );

          return;

        }

        if(
          reconnectTimer
        ){

          return;

        }

        reconnectTimer =
          setTimeout(
            async()=>{

              reconnectTimer = null;

              try{

                console.log(
                  "🔄 Reconnecting WhatsApp..."
                );

                await createSocket(
                  state,
                  saveCreds
                );

              }catch(error){

                console.error(
                  "❌ Reconnect failed:",
                  error.message
                );

              }

            },
            5000
          );

      }

    }
  );

  return sock;

}

/* =========================================================
   REQUEST PAIRING CODE
========================================================= */

async function requestPairCode(
  phoneNumber
){

  if(
    !mongoose.connection ||
    mongoose.connection.readyState !== 1
  ){

    throw new Error(
      "MongoDB is not connected"
    );

  }

  /*
    Close old socket before starting
    a completely new pairing.
  */

  if(activeSocket){

    try{

      activeSocket.end(
        undefined
      );

    }catch(error){}

    activeSocket = null;

  }

  /*
    New pairing means new local auth.
  */

  deleteSessionDir();

  ensureSessionDir();

  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      sessionDir
    );

  const sock =
    await createSocket(
      state,
      saveCreds
    );

  /*
    Baileys needs a little time
    before requesting the code.
  */

  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        3000
      )
  );

  const cleanNumber =
    String(phoneNumber)
      .replace(
        /[^0-9]/g,
        ""
      );

  console.log(
    "📲 Requesting pairing code for:",
    cleanNumber
  );

  let code;

  try{

    code =
      await sock.requestPairingCode(
        cleanNumber
      );

  }catch(error){

    console.error(
      "❌ Pairing code error:",
      error
    );

    try{

      sock.end(
        undefined
      );

    }catch(e){}

    throw error;

  }

  console.log(
    "🔑 Pairing code:",
    code
  );

  return {
    code,
    socket:sock
  };

}

/* =========================================================
   START SAVED SOCKET
========================================================= */

async function startSavedSocket(){

  ensureSessionDir();

  const credsFile =
    path.join(
      sessionDir,
      "creds.json"
    );

  if(
    !fs.existsSync(credsFile)
  ){

    console.log(
      "ℹ️ creds.json not found."
    );

    return null;

  }

  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      sessionDir
    );

  const sock =
    await createSocket(
      state,
      saveCreds
    );

  return sock;

}

/* =========================================================
   EXPORT
========================================================= */

module.exports = {

  sessionDir,

  SessionModel,

  restoreCredentials,

  backupCredentials,

  requestPairCode,

  startSavedSocket,

  getActiveSocket:()=>{
    return activeSocket;
  }

};
