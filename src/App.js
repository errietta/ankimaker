import React, { useState, useEffect } from 'react';
import './App.css';
import Papa from 'papaparse';


function App() {
  const [sentences, setSentences] = useState(() => {
    // Retrieve sentences from local storage on page load
    const savedSentences = localStorage.getItem('sentences');
    return savedSentences ? JSON.parse(savedSentences) : [{ text: '', meaning: '', reading: ''}];
  });

  // Save sentences to local storage whenever it changes
  useEffect(() => {
    localStorage.setItem('sentences', JSON.stringify(sentences));
  }, [sentences]);

  const [apiKey, setApiKey] = useState(() => {
    const apiKey = localStorage.getItem('api-key');
    return apiKey ? apiKey :null;
  });


  const clearAll = () => {
    setSentences([{ text: '', meaning: '' }]); // Reset to a single empty sentence field
    localStorage.removeItem('sentences'); // Clear localStorage
  };


  // Save sentences to local storage whenever it changes
  useEffect(() => {
    localStorage.setItem('apiKey', apiKey);
  }, [apiKey]);



  // Add new sentence
  const addSentence = () => {
    setSentences([...sentences, { text: '', meaning: '', readning: '' }]);
  };


  // Handle input change
  const handleSentenceChange = (index, event) => {
    const newSentences = [...sentences];
    newSentences[index].text = event.target.value;
    setSentences(newSentences);
  };

  // Fetch meaning from the backend API (Mocked as setTimeout for now)
  const getMeaning = async (index) => {
    const sentence = sentences[index];
    if (!sentence.text) return;

    const meaning = await new Promise(async (resolve) => {
      //setTimeout(() => { resolve(`Meaning of "${sentence.text}"`); }, 1000);
      const requestBody = {text: sentence.text};
      const APIBASE='https://talktomodachi-22fa28ff3379.herokuapp.com/';
      const API_KEY = apiKey || prompt('api key');
      setApiKey(API_KEY);

      const response = await fetch(`${APIBASE}meaning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY || '',
        },
        body: JSON.stringify(requestBody),
      });
      const responseData = await response.json();
      console.log(responseData);
      resolve(responseData);
    });

    const newSentences = [...sentences];
    newSentences[index].reading = meaning.reply.reading;
    newSentences[index].meaning = meaning.reply.meaning;
    newSentences[index].text = meaning.reply.sentence;
    setSentences(newSentences);
  };

  // Download CSV file
  const downloadCSV = async () => {
    // Retrieve meanings for sentences that don't have one yet
    for (let i = 0; i < sentences.length; i++) {
      if (!sentences[i].meaning) {
        await getMeaning(i);
      }
    }

    // Create CSV data
    const csvRows = [
      ['Sentence', 'Meaning', 'Reading'],
      ...sentences.map((s) => [s.text, s.meaning, s.reading]),
    ];

    const csv = Papa.unparse(csvRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'sentences.csv');
    document.body.appendChild(link); // Required for FF
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="app">
      <h1>Sentence Meaning Fetcher</h1>
      {sentences.map((sentence, index) => (
        <div key={index} className="sentence-container">
          <textarea
            value={sentence.text}
            onChange={(event) => handleSentenceChange(index, event)}
            placeholder="Type a sentence"
            rows="2"
            cols="30"
          ></textarea>
          <button onClick={() => getMeaning(index)}>Get Meaning</button>
          {sentence.meaning && <p>Meaning: {sentence.meaning}</p>}
          {sentence.reading && <p>Reading: {sentence.reading}</p>}
        </div>
      ))}
      <button onClick={addSentence}>+ Add Another Sentence</button>
      <button onClick={downloadCSV}>Get CSV</button>
      <button onClick={clearAll}>Clear All</button>
    </div>
  );
}

export default App;
