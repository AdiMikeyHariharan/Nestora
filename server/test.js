require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
ai.models.generateContent({
  model: 'gemma-4-31b-it',
  contents: [
    {role:'user',parts:[{text:'yes'}]},
    {role:'model',parts:[{text:"I'm glad you're interested..."}]},
    {role:'user',parts:[{text:'price?'}]},
    {role:'model',parts:[{text:'The price...?'}]},
    {role:'user',parts:[{text:'yes'}]},
    {role:'user',parts:[{text:'es'}]}
  ],
  config: {systemInstruction: 'you are a bot'}
}).then(r => console.log('success')).catch(e => console.error(JSON.stringify(e)));
