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
  console.log('Param Sign: ', request.query.sign)
  const sign = 'Aquarius'
  if (!request.query.sign) {
    sign = request.query.sign
  }

  const data = tweetHoroscope(sign)

  response.send(data);
});

async function tweetHoroscope(sign) {
  const { refreshToken } = (await dbRef.get()).data();

  const {
    client: refreshedClient,
    accessToken,
    refreshToken: newRefreshToken,
  } = await twitterClient.refreshOAuth2Token(refreshToken)

  await dbRef.set({ accessToken, refreshToken: newRefreshToken });

  const aiResponse = await openai.createCompletion({
    model: "text-davinci-002",
    prompt: "Tweet today's " + sign + " horoscope in Spanish",
    temperature: 0,
    max_tokens: 60,
    top_p: 1,
    frequency_penalty: 0.5,
    presence_penalty: 0,
  });

  console.log('ai:', aiResponse.data.choices[0].text)

  const { data } = await refreshedClient.v2.tweet(
    aiResponse.data.choices[0].text
  );
  return data;
}

exports.tweetHourly = functions.pubsub.schedule('52 12 * * *')
  .onRun((context) => {
    console.log('Tweet ', signs[0])
    tweetHoroscope(signs[0])
    return null;
  });

exports.tweetHourly2 = functions.pubsub.schedule('53 12 * * *')
  .onRun((context) => {
    console.log('Tweet ', signs[1])
    tweetHoroscope(signs[1])
    return null;
  });

const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']