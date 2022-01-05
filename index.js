const http = require('http');
const express = require('express');
const api = express();
const bodyParser = require('body-parser');
const cors = require('cors');
var porta = process.env.PORT || 8080;
const axios = require("axios");

require("dotenv").config();

api.use(cors());

api.use(require("cors")());

var corsOptions = {
  origin: 'https://bott.digital',
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}

api.use(bodyParser.json());

const appLtsVersion = "0.0.90";

const COOB_KEY = process.env.COOB_KEY;
const INITIAL_TOKEN = process.env.INITIAL_TOKEN;
const TOKEN_API = process.env.TOKEN_API;
const CRYPT_KEY = process.env.CRYPT_KEY;


const apiD4sign = axios.create({
  baseURL: "https://secure.d4sign.com.br/api/v1/",
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "*",

    "access-control-allow-crigin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",

    "Content-Type": "application/json",
    "content-type": "application/json",
  },
});

const auth = (req, res, next) => {
  console.log("REQUEST_HOST: => ", req.hostname);
  console.log("REQUEST_IP: => ", req.ip);

  const { coobkey } = req.headers;

  // console.log("coobkey=>", coobkey, "<==coobkey");

  if (!coobkey)
    return res.send({
      coobkey: null,
    });

  if (coobkey !== COOB_KEY)
    return res.send({
      coobkey: false,
    });

  next();
};

api.post("/d4sign/envio", auth, async (req, res) => {
  const { documento, signatarios, vendedor } = req.body;

  if (!documento) return res.send({ documento: null }).status(400);
  if (!signatarios) return res.send({ signatarios: null });

  console.log("vendedor==>", JSON.stringify(vendedor), "<==vendedor");

  try {
    // 1) REGISTRO DOCUMENTO:
    const resCriacaoDocumento = await apiD4sign.post(
      `documents/${INITIAL_TOKEN}/makedocumentbytemplate?tokenAPI=${TOKEN_API}&cryptKey=${CRYPT_KEY}`,
      documento
    );

    console.log(
      "resCriacaoDocumento.data==>",
      resCriacaoDocumento.data,
      "<==resCriacaoDocumento.data"
    );
    //  data: { message: 'success', uuid: '268998e0-23ba-4d93-b81b-96c56a32e094' }

    if (!resCriacaoDocumento.data)
      return res.send({ criacaoDocumento: null }).status(400);

    if (!resCriacaoDocumento.data.uuid)
      return res.send({ uuid: null }).status(400);

    const { uuid } = resCriacaoDocumento.data;

    // 2) REGISTRO SIGNATARIOS
    const resCriacaoSignatarios = await apiD4sign.post(
      `documents/${uuid}/createlist?tokenAPI=${TOKEN_API}&cryptKey=${CRYPT_KEY}`,
      { signers: signatarios }
    );

    console.log(
      "resCriacaoSignatarios==>",
      resCriacaoSignatarios.data,
      "<==resCriacaoSignatarios"
    );

    if (!resCriacaoSignatarios.status === 200)
      return res.send({ criacaoSignatarios: false }).status(400);

    // 3) ENVIO DOCUMENTO:
    const resEnvioDocumento = await apiD4sign.post(
      `documents/${uuid}/sendtosigner?tokenAPI=${TOKEN_API}&cryptKey=${CRYPT_KEY}`,
      {
        message: "Segue documento para assinatura enviado pelo Aplicativo",
        workflow: "0",
        skip_email: "0",
      }
    );

    console.log(
      "resEnvioDocumento==>",
      resEnvioDocumento.data,
      "<==resEnvioDocumento"
    );

    if (!resEnvioDocumento.data)
      return res.send({ envioDocumento: null }).status(400);

    if (!resEnvioDocumento.data.message)
      return res.send({ envioDocumento: false }).status(400);

    if (vendedor && vendedor.email !== undefined) {
      // 4) REGISTRA OBSERVADOR (VENDEDOR)
      const resVendedorObservador = await apiD4sign.post(
        `watcher/${uuid}/add?tokenAPI=${TOKEN_API}&cryptKey=${CRYPT_KEY}`,
        {
          email: vendedor.email,
          permission: "1",
        }
      );

      if (!resVendedorObservador.data)
        return res
          .send({
            uuid,
            criacaoDocumento: true,
            criacaoSignatarios: true,
            envioDocumento: true,
            envioVendedor: null,
          })
          .status(200);

      console.log(
        "resVendedorObservador==>",
        resVendedorObservador.data,
        "<==resVendedorObservador"
      );

      if (!resVendedorObservador.data.message)
        return res
          .send({
            uuid,
            criacaoDocumento: true,
            criacaoSignatarios: true,
            envioDocumento: true,
            envioVendedor: false,
          })
          .status(200);
    }

    return res
      .send({
        uuid,
        criacaoDocumento: true,
        criacaoSignatarios: true,
        envioDocumento: true,
        envioVendedor: true,
      })
      .status(200);
  } catch (e) {
    // console.log("resEnvioAssinaturas error: ", e);

    return res.status(400).send({
      envio: false,
    });
  }
});

api.post("/d4sign/consulta", auth, async (req, res) => {
  const { uuid } = req.body;

  if (!uuid) return res.send({ uuid: null });

  try {
    // CONSULTA CONTRATO
    const resConsultaAssinaturas = await apiD4sign.get(
      `documents/${uuid}?tokenAPI=${TOKEN_API}&cryptKey=${CRYPT_KEY}`
    );

    // console.log(resConsultaAssinaturas);

    if (!resConsultaAssinaturas)
      return res.send({ consultaAssinaturas: null }).status(400);

    if (!resConsultaAssinaturas.data)
      return res.send({ dataConsultaAssinaturas: null }).status(400);

    if (!resConsultaAssinaturas.data[0].statusId)
      return res.send({ statusId: null });

    const { statusId } = resConsultaAssinaturas.data[0];

    if (Number(statusId) !== 4) return res.send({ assinado: false });

    return res.send({
      assinado: true,
    });
  } catch (e) {
    // console.log("resConsultaAssinaturas error: ", e);

    return res
      .send({ consultaAssinaturas: null, error: JSON.stringify(e) })
      .status(400);
  }
});

api.get("/app/version", (req, res) => {
  res.status(200).send({
    lts: appLtsVersion,
  });
});

const upload = require("multer")();
api.post('/send', cors(corsOptions), upload.single('anexo'), (req, res, next) => {
  const name = req.body.name;
  const email = req.body.email;
  const phone = req.body.phone;
  const mensagem = req.body.mensagem;
  const anexo = req.file;
  require("./nodemail")(email, name, phone, mensagem, anexo)
    .then(response => res.json(response))
    .catch(error => res.json(error));
})

api.get('/', (req, res) => {
  const html =  `
  <html>
    <head>
      <style>
        * {
          box-sizing: border-box;
        }

        body {
          // padding-top: 20px;
        }

        body * {
          font-family: Segoe UI;
          color: #444;
          // margin: 5px;
          padding-left: 20px;
          // padding-right: 20px;
        }
      </style>
    </head>

    <body>
      <h1>API VENDAS COOBRASTUR</h1>

      <hr />

      <h2>GET /app/version</h2>

      <h3>RESPONSE: </h3>
      
      <p><strong>headers:</strong> {</p>
      <p>
        <span> } </span>
      </p>

      <p><strong>body:</strong> {</p>

      <p>
        <span>
          <span>lts: VERSAO_MINIMA</span>
        </span>
      </p>
     
      <p>
        <span> } </span>
      </p>

      <br>

      
      <h2>POST /d4sign/envio</h2>

      <h3>REQUEST: </h3>

      <p><strong>headers:</strong> {</p>
      <p>
        <span>
          <span> coobkey: HASH_COOBRASTUR </span>
        </span>
      </p>
      <p>
        <span> } </span>
      </p>

      <p><strong>body:</strong> {</p>
      <p>
        <span>
          <span> documento: DOCUMENTO_OBJ </span>
        </span>
      </p>
      <p>
        <span>
          <span> signatarios: SIGNERS_ARRAY </span>
        </span>
      </p>
      <p>
      <span>
        <span> vendedor: VENDEDOR_OBJ(usuario, email) </span>
      </span>
    </p>
      <p>
        <span> } </span>
      </p>

      <br />
         
      <h2>POST /d4sign/consulta</h2>

      <h3>REQUEST: </h3>

      <p><strong>headers:</strong> {</p>
      <p>
        <span>
          <span> coobkey: HASH_COOBRASTUR </span>
        </span>
      </p>
      <p>
        <span> } </span>
      </p>

      <p><strong>body:</strong> {</p>
      <p>
        <span>
          <span> uuid: D4SIGN_ID_STRING </span>
        </span>
      </p>

      <p>
        <span> } </span>
      </p>
    </body>
  </html>
`
  res.send(html)
})
var porta = process.env.PORT || 8080
const server = http.createServer(api);
server.listen(porta);
console.log("Servidor rodando na porta" + porta + "pronto para o Heroku.")

