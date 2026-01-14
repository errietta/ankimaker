# Study card maker

I designed this for Anki cards but I suppose it can be used on any app in which you can import CSV files.
The app works by allowing you to type Japanese sentences from manga or whatever you are reading.
Once you are ready and click the 'get meaning' button the app will retrieve the meaning and reading from the backend.

For example, entering 「日本語を勉強しています」 will return two fields:
reading: 日本語[にほんご]を 勉強[べんきょう]しています
meaning: I am studying Japanese

The backend is of course a simple call to OpenAI.
The reading format works with Anki but I don't know about other cards. It will be annotated with Furigana to help with learning how to read Kanji.
I have used the underlying ChatGPT prompt with about 10 books so far and I haave not had major issues but it can occasionally be wrong or buggy when
generating readings. You can just click to re-generate.

You can view the app here: https://errietta.github.io/ankimaker/index.html

Because the app is under development you need an invite to use the app, please contact me if you want one. Or you can deploy your own with your own OpenAI key. 
OpenAI costs me money to use, and also it's possible that people will abuse my API integration so it's unlikely that I will open this app to the wider public.
However, if you want to see the backend code it's here: https://github.com/errietta/ankimaker-backend/blob/main/server.js# 
So feel free to deploy your own version.
