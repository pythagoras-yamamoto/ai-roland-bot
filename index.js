"use strict";

// ########################################
//     初期設定
// ########################################
const fs = require("fs");
const express = require("express");
const line = require("@line/bot-sdk");
const { FaceClient } = require("@azure/cognitiveservices-face");
const { CognitiveServicesCredentials } = require("@azure/ms-rest-azure-js");
const requestPromise = require('request-promise');
const queryString = require('querystring');

// LINE Botパラメータ
const config = {
    channelAccessToken: process.env.LINE_ACCESS_TOKEN, // 環境変数からアクセストークンをセットしています
    channelSecret: process.env.LINE_CHANNEL_SECRET // 環境変数からChannel Secretをセットしています
};
const lineClient = new line.Client(config);

// Face APIパラメータ
const faceKey = "d92f6cd1f6dd41a7bbdd348427963119";
const faceEndPoint = "https://handson-20211222.cognitiveservices.azure.com/";
const cognitiveServiceCredentials = new CognitiveServicesCredentials(faceKey);
const faceClient = new FaceClient(cognitiveServiceCredentials, faceEndPoint);

let rolandFaceId = '';
let rolandFaceTestKey = false;  

// LUIS APIパラメータ
const LUIS_appId = "4c6cabf9-1b66-4d21-a6c6-983f3bb484e3";
const LUIS_predictionKey = "cdfa4214e05c4617ba76366b849e29c2";
const LUIS_endpoint = "https://australiaeast.api.cognitive.microsoft.com/";


let rolandSentimentTestKey = false;

const { TextAnalyticsClient, AzureKeyCredential } = require("@azure/ai-text-analytics");
const { type } = require("os");
const key = '04ca7e1bf3314e419fa503115913f0a4';
const endpoint = 'https://roland-bot.cognitiveservices.azure.com/';
// Authenticate the client with your key and endpoint
const textAnalyticsClient = new TextAnalyticsClient(endpoint,  new AzureKeyCredential(key));


// ########################################
//     テキストの感情分析機能
// ########################################
async function sentimentAnalysis(client){

    const sentimentInput = [
        "kill , kill, , break"
    ];
    const sentimentResult = await client.analyzeSentiment(sentimentInput);
    const res = sentimentResult[0].confidenceScores
    console.log("*************");
    console.log(res);
    console.log(typeof(sentimentResult[0].confidenceScores))
    return res
}


// ########################################
//     LINEサーバーからのWebhookデータを処理する部分
// ########################################
async function handleEvent(event) {

  const sentimentScores = await sentimentAnalysis(textAnalyticsClient)

  if(event.message.type == "text" && event.message.text == "ローランド文章感情分析をリセット" && rolandSentimentTestKey == true){
    rolandSentimentTestKey = false;
    return lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: "オーケー！リセットしたぜ"
    });
  } else if (event.message.type == "text" && rolandSentimentTestKey == true && sentimentScores.positive > 0.8){
    return lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: "元気だね、その方が良い。"
    });
  } else if (event.message.type == "text" && rolandSentimentTestKey == true && sentimentScores.negative > 0.8) {
    return lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: "感情スコアは -" + sentimentScores.negative + "。下向く暇ある？俺は前しか向けないよね"
    });
  }

  // 画像を受信した場合は、Face APIを使って感情分析する
  if (event.message.type === "image" && rolandFaceTestKey == true) {
    try {
      // 画像を取得する
      const image = await downloadContent(event.message.id);

      // 画像を取得し終わったらFace APIに送信して、顔検出を行う
      const faceList = await faceClient.face.detectWithStream(image);
      console.log(JSON.stringify(faceList));

      let text = '';

      
      // 1枚目と2枚目の顔の一致度を取得する
      if (faceList[0].faceId && rolandFaceId) {
        const result = await faceClient.face.verifyFaceToFace(faceList[0].faceId, rolandFaceId);
        console.log(result);
        text = '俺の顔との類似度は' + Math.floor(result.confidence * 100) + '%だね';
      } else {
        text = '類似度の測定をしたい顔画像を送ってくれ';
        rolandFaceId = faceList[0].faceId;
        console.log(rolandFaceId);
      }

      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: text, // ← ここに入れた言葉が実際に返信されます
      });
    } catch (e) {
      console.error(e);
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: "画像取得or画像分析中にエラーが発生したらしいよ。顔画像をもう一度送ってみてくれないか?",
      });
    }
  }



  // イベントが「テキストメッセージ」だった場合の処理
  if (event.message.type == "text"){
    const text = event.message.text;
    const agentText = await getPrediction(text)
    const json = JSON.parse(agentText);

    if(text == "ローランド類似度測定"){
      rolandFaceTestKey = true;
      return lineClient.replyMessage(event.replyToken, [{
        type: "image",
        originalContentUrl : "https://drive.google.com/uc?id=1v7JJZrAz5PC5FkUUWMuMsl2wO6NPeP6E",
        previewImageUrl: "https://drive.google.com/uc?id=1v7JJZrAz5PC5FkUUWMuMsl2wO6NPeP6E"
      },{
        type: "text",
        text: "君は「俺か、俺以外か。」試してみようか？まずは俺の顔を送ってみてくれ。\nもし類似度測定の設定をリセットしたいときは「ローランド類似度測定をリセット」とメッセージで送信してくれ"
      }]);
    } else if (text == "ローランド類似度測定をリセット"){
      rolandFaceTestKey = false;
      rolandFaceId = '';
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: "オーケー！リセットしたぜ"
      });
    } else if (text == "ローランド文章感情分析"){
      rolandSentimentTestKey = true;
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: "テキストから感情度を算出するよ。テキストを再度送ってみてくれ。\nもしテキスト感情分析の設定をリセットしたいときは「ローランド文章感情分析をリセット」とメッセージで送信してくれ"
      });
    } else if (text =="ローランド文章感情分析をリセット"){
      rolandSentimentTestKey = false;
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: "オーケー！リセットしたぜ"
      });
    } else if (text.match(/名言/)){
      const text = makeWiseRemarks() 
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: text
      });
    } else if (text.match(/おはよ|こんにちは|こんばん｜やあ|うっす|どうも|お疲れ|おつかれ/)){
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: "どうも"
      });
    } else if (text.match(/彼女|彼氏|恋愛|愛|恋人|好きな人/)) {
              // (json.prediction.topIntent == "FindRelationshipAdvice" && 
              // json.prediction.intents.None.score < 0.01 &&
              // json.prediction.intents.FindRelationshipAdvice.score > 0.9)){
      return lineClient.replyMessage(event.replyToken, {
        type: "text", 
        text: makeWiseRemarksLove()
      });
    } else if (json.prediction.topIntent == "FindGame" && json.prediction.intents.None.score < 0.05 && json.prediction.intents.FindGame.score > 0.9){
      return lineClient.replyMessage(event.replyToken, {
        type: "text", 
        text: "実は巨人好きです"
      });
    } else if ((text.match(/年収|仕事|職場|上司/)) || 
             (json.prediction.topIntent == "FindWork" && 
             json.prediction.intents.None.score < 0.1 &&
             json.prediction.intents.FindWork.score > 0.9)){
      return lineClient.replyMessage(event.replyToken, {
        type: "text", 
        text: makeWiseRemarksWork()
      }); 
    } else {
      return lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: "ちょっと何言ってるかわかんない"
      });
    }
  }

  // if (event.message.type == "text" && rolandSentimentTestKey==true && sentiment=="positive"){
  //   return lineClient.replyMessage(event.replyToken, {
  //     type: "text",
  //     text: "ちょっと元気だしな？"
  //   });
  // }
}

// ########################################
//     LINEで送られた画像を保存する部分
// ########################################
async function downloadContent(messageId, downloadPath = "./image.png") {
  const data = [];
  return lineClient.getMessageContent(messageId).then(
    (stream) =>
      new Promise((resolve, reject) => {
        const writable = fs.createWriteStream(downloadPath);
        stream.on("data", (chunk) => data.push(Buffer.from(chunk)));
        stream.pipe(writable);
        stream.on("end", () => resolve(Buffer.concat(data)));
        stream.on("error", reject);
      })
  );
}

// ########################################
//     LUISによる応答部分
// ########################################
async function getPrediction(text) {

  // Create query string
  const queryParams = {
      "show-all-intents": true,
      "verbose":  true,
      "query": text,
      "subscription-key": LUIS_predictionKey
  }

  // Create the URI for the REST call.
  const URI = `${LUIS_endpoint}luis/prediction/v3.0/apps/${LUIS_appId}/slots/production/predict?${queryString.stringify(queryParams)}`

  const res = await requestPromise(URI);
  console.log(res)

  return res;
}

// ########################################
//      発話の設定部分
// ########################################

function makeWiseRemarks() {
  const array = 
    ["その辺の小さな神社より俺の方がご利益ありそう", 
    "シャワー浴びる時はオーラから洗う",
    "俺に会うまで何が楽しくて生きてきたの？",
    "君の年収が俺の時給",
    "No2のなり方、教えてくれない？",
    "今してみたいこと？片思いかな",
    "幸せは歩いてこない？確かにね。駆け寄ってくるよ",
    "若い時から歴史作るのに必死で歴史勉強してこなかった",
    "デブは甘え。普通に生きていたら太らない"
    ];
  return array[Math.floor(Math.random() * array.length)];
}

function makeWiseRemarksWork() {
  const array = 
    ["君の年収は俺の時給ね", 
    "100億円もらっても、明日定時に出勤できるか？",
    "俺は、仕事のやり方には三種類あると思っている。 正しいやり方、間違ったやり方、そして、俺のやり方",
    "No2のなり方、教えてくれない？"
    ];
  return array[Math.floor(Math.random() * array.length)];
}

function makeWiseRemarksLove() {
  const array = 
    ["男は好きな女性に振り回せることが一番の幸せ", 
    "女性はパンと水とローランドがあれば生きていける",
    "恋はするものではなくて、落ちるものだから、無理やりするものではないのかなって思う。",
    "俺、交通ルールは守れない。お前しか守れない"
    ];
  return array[Math.floor(Math.random() * array.length)];
}


// ########################################
//      Expressによるサーバー部分
// ########################################
const app = express();
const PORT = process.env.PORT || 3000;

// HTTP POSTによって '/webhook' のパスにアクセスがあったら、POSTされた内容に応じて様々な処理をします
app.post("/bot/webhook", line.middleware(config), (req, res) => {
  // Webhookの中身を確認用にターミナルに表示します
  console.log(req.body.events)

  // あらかじめ宣言しておいた 'handleEvent' 関数にWebhookの中身を渡して処理してもらい、
  // 関数から戻ってきたデータをそのままLINEサーバーに「レスポンス」として返します
  Promise.all(req.body.events.map(handleEvent)).then((result) => {
    res.json(result);
  });
});

app.listen(PORT);
console.log(`ポート${PORT}番でExpressサーバーを実行中です…`);