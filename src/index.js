import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [sentences, setSentences] = useState(() => {
    // Retrieve sentences from local storage on page load
    const savedSentences = localStorage.getItem('sentences');
    return savedSentences ? JSON.parse(savedSentences) : [{ text: '', meaning: '' }];
  });

  // Save sentences to local storage whenever it changes
  useEffect(() => {
    localStorage.setItem('sentences', JSON.stringify(sentences));
  }, [sentences]);

  // Add new sentence
  const addSentence = () => {
    setSentences([...sentences, { text: '', meaning: '' }]);
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

    // Mock API call
    const meaning = await new Promise((resolve) => {
      setTimeout(() => {
        resolve(`Meaning of "${sentence.text}"`);
      }, 1000);
    });

    const newSentences = [...sentences];
    newSentences[index].meaning = meaning;
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
      ['Sentence', 'Meaning'],
      ...sentences.map((s) => [s.text, s.meaning]),
    ];

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      csvRows.map((row) => row.join(',')).join('\n');

    // Create link element for download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
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
        </div>
      ))}
      <button onClick={addSentence}>+ Add Another Sentence</button>
      <button onClick={downloadCSV}>Get CSV</button>
    </div>
  );
}

export default App;
