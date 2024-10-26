import React, { useState, useEffect } from 'react';
import { useAuth0 } from "@auth0/auth0-react";
import { useTranslation } from 'react-i18next';


import LogoutButton from './LogoutButton';
import './App.css';
import Papa from 'papaparse';


function Cards() {
  const { getAccessTokenSilently } = useAuth0();
  const { t } = useTranslation();

  const [sentences, setSentences] = useState(() => {
    // Retrieve sentences from local storage on page load
    const savedSentences = localStorage.getItem('sentences');
    return savedSentences ? JSON.parse(savedSentences) : [{ text: '', meaning: '', reading: ''}];
  });

  // Save sentences to local storage whenever it changes
  useEffect(() => {
    localStorage.setItem('sentences', JSON.stringify(sentences));
  }, [sentences]);

  const clearAll = () => {
    if (window.confirm("Really clear?")) {
      setSentences([{ text: '', meaning: '' }]); // Reset to a single empty sentence field
      localStorage.removeItem('sentences'); // Clear localStorage
    }
  };

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

      const accessToken = await getAccessTokenSilently({
        authorizationParams: {
          audience: `https://card.backend/`,
          scope: "read:current_user",
        },
      });

      console.log({accessToken});

      const response = await fetch(`${APIBASE}meaning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
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
      ['Sentence', 'Reading', 'Meaning'],
      ...sentences.map((s) => [s.text, s.reading, s.meaning]),
    ];

    const csv = Papa.unparse(csvRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'anki-sentences.csv');
    document.body.appendChild(link); // Required for FF
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="app">
      <h1>{t('welcome')}</h1>

      {sentences.map((sentence, index) => (
        <div key={index} className="sentence-container">
          <textarea
            value={sentence.text}
            onChange={(event) => handleSentenceChange(index, event)}
            placeholder={t('add_sentence')}
            rows="2"
            cols="30"
          ></textarea>
          <button onClick={() => getMeaning(index)}>{t('get_meaning')}</button>
          {sentence.meaning && <p>{t('meaning')}: {sentence.meaning}</p>}
          {sentence.reading && <p>{t('reading')}: {sentence.reading}</p>}
        </div>
      ))}

      <button className="button-add" onClick={addSentence}>{t('add_sentence')}</button>
      <button className="button-download" onClick={downloadCSV}>{t('get_csv')}</button>
      <button className="button-danger" onClick={clearAll}>{t('clear_all')}</button>
      <br/><br/>
      <div>
        <LogoutButton/>
      </div>
    </div>
  );
}

export default Cards;
