require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const {
  restoreCredentials,
  requestPairCode,
  startSavedSocket
} = require("./auth");

const app = express();

const PORT = process.env.PORT || 3000;

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://diniduheshan2007_db_user:Heshan2007@cluster0.ah8jggk.mongodb.net/dark-dinu?retryWrites=true&w=majority&appName=Cluster0";

let activeSocket = null;
let pairingInProgress = false;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   HOME PAGE
========================================================= */

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>DARK DINU • PAIRING</title>

<style>

*{
  margin:0;
  padding:0;
  box-sizing:border-box;
  font-family:Arial,Helvetica,sans-serif;
}

body{
  min-height:100vh;
  display:flex;
  justify-content:center;
  align-items:center;
  padding:20px;

  background:
    radial-gradient(
      circle at top,
      #3a0000 0%,
      #120000 35%,
      #050505 70%,
      #000 100%
    );

  color:white;
}

.card{
  width:100%;
  max-width:430px;

  padding:30px 24px;

  border-radius:24px;

  background:rgba(15,15,15,.94);

  border:1px solid rgba(255,0,0,.25);

  box-shadow:
    0 0 50px rgba(255,0,0,.12),
    inset 0 0 25px rgba(255,0,0,.03);

  text-align:center;
}

.logo{
  width:90px;
  height:90px;

  margin:0 auto 18px;

  display:flex;
  justify-content:center;
  align-items:center;

  border-radius:22px;

  background:
    linear-gradient(
      145deg,
      #ff0000,
      #700000
    );

  font-size:25px;
  font-weight:900;

  box-shadow:
    0 0 30px rgba(255,0,0,.3);
}

h1{
  font-size:28px;
  margin-bottom:8px;
}

.subtitle{
  color:#999;
  font-size:14px;
  margin-bottom:28px;
}

input{
  width:100%;

  padding:16px;

  border-radius:14px;

  border:1px solid #333;

  background:#080808;

  color:white;

  outline:none;

  text-align:center;

  font-size:16px;
}

input:focus{
  border-color:#e00000;

  box-shadow:
    0 0 15px rgba(255,0,0,.15);
}

button{
  width:100%;

  margin-top:14px;

  padding:16px;

  border:none;

  border-radius:14px;

  background:
    linear-gradient(
      90deg,
      #9d0000,
      #ff0000
    );

  color:white;

  font-size:16px;

  font-weight:800;

  cursor:pointer;
}

button:disabled{
  opacity:.5;
  cursor:not-allowed;
}

#result{
  margin-top:22px;
  min-height:40px;
}

.code{
  margin-top:12px;

  padding:18px;

  border-radius:14px;

  background:#050505;

  border:1px solid #420000;

  color:#ff3030;

  font-size:28px;

  font-weight:900;

  letter-spacing:5px;
}

.error{
  color:#ff5050;
}

.success{
  color:#55ff88;
}

.info{
  color:#aaa;
  font-size:13px;
  margin-top:10px;
}

.footer{
  margin-top:25px;

  color:#555;

  font-size:12px;
}

</style>

</head>

<body>

<div class="card">

  <div class="logo">DD</div>

  <h1>DARK DINU</h1>

  <div class="subtitle">
    WhatsApp Multi Device Pairing
  </div>

  <input
    id="number"
    type="tel"
    placeholder="947XXXXXXXX"
    autocomplete="off"
  >

  <button
    id="pairButton"
    onclick="generateCode()"
  >
    GET PAIRING CODE
  </button>

  <div id="result"></div>

  <div class="footer">
    Powered by DARK DINU
  </div>

</div>

<script>

async function generateCode(){

  const input =
    document.getElementById("number");

  const button =
    document.getElementById("pairButton");

  const result =
    document.getElementById("result");

  let number =
    input.value
      .replace(/[^0-9]/g,"")
      .trim();

  if(number.startsWith("0")){
    number =
      "94" + number.substring(1);
  }

  if(!/^94[0-9]{9}$/.test(number)){

    result.innerHTML =
      '<div class="error">' +
      'Invalid number. Example: 947XXXXXXXX' +
      '</div>';

    return;
  }

  button.disabled = true;

  result.innerHTML =
    '<div class="info">' +
    'Generating pairing code... Please wait.' +
    '</div>';

  try{

    const response =
      await fetch(
        "/pair?num=" +
        encodeURIComponent(number)
      );

    const data =
      await response.json();

    if(data.code){

      result.innerHTML =
        '<div class="success">' +
        'PAIRING CODE' +
        '</div>' +

        '<div class="code">' +
        data.code +
        '</div>' +

        '<div class="info">' +
        'WhatsApp → Linked Devices → Link a Device' +
        '</div>';

    }else{

      result.innerHTML =
        '<div class="error">' +
        (data.error || "Pairing failed") +
        '</div>';

    }

  }catch(error){

    console.error(error);

    result.innerHTML =
      '<div class="error">' +
      'Server error. Please try again.' +
      '</div>';

  }

  button.disabled = false;

}

</script>

</body>
</html>
  `);
});

/* =========================================================
   PAIRING
========================================================= */

app.get("/pair", async (req, res) => {

  if(pairingInProgress){

    return res.status(429).json({
      error:
        "Another pairing request is already running. Please wait."
    });

  }

  let number =
    String(req.query.num || "")
      .replace(/[^0-9]/g,"");

  if(number.startsWith("0")){

    number =
      "94" + number.substring(1);

  }

  if(!/^94[0-9]{9}$/.test(number)){

    return res.status(400).json({
      error:
        "Invalid Sri Lankan number. Use 947XXXXXXXX"
    });

  }

  pairingInProgress = true;

  try{

    console.log(
      "📱 Pairing request:",
      number
    );

    const result =
      await requestPairCode(number);

    if(!result || !result.code){

      throw new Error(
        "Pairing code was not generated"
      );

    }

    activeSocket =
      result.socket || activeSocket;

    return res.json({
      success:true,
      code:result.code
    });

  }catch(error){

    console.error(
      "❌ Pairing error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Pairing failed"
    });

  }finally{

    pairingInProgress = false;

  }

});

/* =========================================================
   HEALTH
========================================================= */

app.get("/health", (req,res)=>{

  res.json({

    status:"online",

    mongodb:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected",

    whatsapp:
      activeSocket
        ? "active"
        : "not-connected"

  });

});

/* =========================================================
   START
========================================================= */

async function start(){

  try{

    console.log(
      "🔄 Connecting to MongoDB..."
    );

    await mongoose.connect(
      MONGO_URI,
      {
        serverSelectionTimeoutMS:30000,
        socketTimeoutMS:45000
      }
    );

    console.log(
      "✅ MongoDB connected"
    );

    await restoreCredentials();

    console.log(
      "🔄 Checking saved WhatsApp session..."
    );

    try{

      activeSocket =
        await startSavedSocket();

      if(activeSocket){

        console.log(
          "✅ Saved WhatsApp session started"
        );

      }else{

        console.log(
          "ℹ️ No saved WhatsApp session found"
        );

      }

    }catch(error){

      console.error(
        "⚠️ Saved session error:",
        error.message
      );

    }

    app.listen(
      PORT,
      "0.0.0.0",
      ()=>{
        console.log("");
        console.log(
          "================================="
        );
        console.log(
          "🚀 DARK DINU IS ONLINE"
        );
        console.log(
          "🌐 PORT:",
          PORT
        );
        console.log(
          "🗄️ MONGODB: CONNECTED"
        );
        console.log(
          "================================="
        );
        console.log("");
      }
    );

  }catch(error){

    console.error(
      "❌ STARTUP ERROR:",
      error
    );

    process.exit(1);

  }

}

start();
