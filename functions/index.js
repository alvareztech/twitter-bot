const functions = require("firebase-functions");

const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const admin = require('firebase-admin');
admin.initializeApp();
const { TwitterApi } = require("twitter-api-v2");

const dbRef = admin.firestore().doc('tokens/demo');

const twitterApi = require('twitter-api-v2').default;
const twitterClient = new TwitterApi({
  clientId: process.env.TWITTER_CLIENT_ID,
  clientSecret: process.env.TWITTER_CLIENT_SECRET
})

const callbackUrl = process.env.CALLBACK_URL

exports.auth = functions.https.onRequest(async (request, response) => {
  const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
    callbackUrl,
    { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] }
  )
  await dbRef.set({ codeVerifier, state });

  response.redirect(url)
});

exports.callback = functions.https.onRequest(async (request, response) => {
  const { state, code } = request.query;

  const dbSnapshot = await dbRef.get();
  const { codeVerifier, state: storedState } = dbSnapshot.data();

  if (state !== storedState) {
    return response.status(400).send('Stored tokens do not match!');
  }

  const {
    client: loggedClient,
    accessToken,
    refreshToken
  } = await twitterClient.loginWithOAuth2({
    code,
    codeVerifier,
    redirectUri: callbackUrl
  });

  await dbRef.set({ accessToken, refreshToken });

  response.sendStatus(200);
});

exports.tweet = functions.https.onRequest(async (request, response) => {
  console.log('Text Sign: ', request.query.text)
  let text = 'Hello World!'
  if (!request.query.text) {
    text = request.query.text
  }
  console.log('Text: ', text);
  const data = tweetHoroscope(text)
  response.send(data);
});

async function tweetHoroscope(text) {
  console.log('tweetHoroscope: ', text);
  const { refreshToken } = (await dbRef.get()).data();
  const {
    client: refreshedClient,
    accessToken,
    refreshToken: newRefreshToken,
  } = await twitterClient.refreshOAuth2Token(refreshToken)

  await dbRef.set({ accessToken, refreshToken: newRefreshToken });

  const { data } = await refreshedClient.v2.tweet(
    text
  );
  return data;
}

async function generateText(prompt) {
  const aiResponse = await openai.createCompletion({
    model: "text-davinci-002",
    prompt: prompt,
    temperature: 1,
    max_tokens: 105,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  });

  console.log('ai:', aiResponse.data.choices[0].text);

  return aiResponse.data.choices[0].text.trim();
}

exports.automaticTweet = functions.pubsub.schedule('0 * * * *')
  .onRun(async (context) => {
    console.log('Tweet time!')
    const basePrompt = prompts[probabilityPrompts[Math.floor(Math.random() * 6)]]
    const sign = signs[Math.floor(Math.random() * 12)];
    const prompt = basePrompt.replace('@', sign);
    console.log('Prompt generated: ', prompt);
    let text = await generateText(prompt);
    tweetHoroscope(text + " #" + sign);
    return null;
  });

const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']
const prompts = ["Tweet today's horoscope of @ in Spanish.", "Lucky number of @ in Spanish."]
const probabilityPrompts = [0, 1, 0, 0, 1, 0]
