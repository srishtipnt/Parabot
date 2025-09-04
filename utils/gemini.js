// utils/gemini.js

import 'dotenv/config';
import axios from 'axios';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * A generic function to call the Gemini API.
 * @param {string} prompt The text prompt to send to the API.
 * @returns {Promise<string>} The text response from the API.
 */
export async function callGeminiAPI(prompt) {
  if (!GEMINI_API_KEY) {
    console.error('❌ FATAL ERROR: GEMINI_API_KEY is not defined in your .env file.');
    return '⚠️ Sorry, my connection to the AI is not configured.';
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
    });

    return response.data.candidates?.[0]?.content?.parts?.[0]?.text || "Hmm, I'm not sure how to reply to that.";
  } catch (error) {
    console.error('❌ Gemini API Error:', error.response?.data || error.message);
    return '⚠️ Sorry, my brain is a bit fuzzy right now.';
  }
}