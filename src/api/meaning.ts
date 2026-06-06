import { SentenceCard } from "../types/Cards";

type SentenceMeaningAPIResponse = {
  reply: {
    sentence: string;
    meaning: string;
    reading: string;
  };
};

export type PhotoMeaningAPIResponse = {
  prompt: string;
  reply: {
    sentence: string;
    reading: string;
    meaning: string;
  };
};

export class ApiClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async getSentenceMeaning(
    sentence: SentenceCard,
    language: string="jp-JP"
  ): Promise<SentenceMeaningAPIResponse> {
    const requestBody = { text: sentence.text, language, };
    const APIBASE = "https://ankimaker-backend-88a288e4b6bb.herokuapp.com/";

    const response = await fetch(`${APIBASE}meaning`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseData = await response.json();
    console.log(responseData);

    return responseData;
  }

  async getPhotoMeaning(
    imageBase64: string,
    mimeType: string,
    language: string = "jp-JP"
  ): Promise<PhotoMeaningAPIResponse> {
    const APIBASE = "https://ankimaker-backend-88a288e4b6bb.herokuapp.com/";
    const response = await fetch(`${APIBASE}meaning/photo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({ language, imageBase64, mimeType }),
    });
    const responseData = await response.json();
    console.log(responseData);
    return responseData;
  }
}
