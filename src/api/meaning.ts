import { SentenceCard } from "../types/Cards";

type SentenceMeaningAPIResponse = {
  reply: {
    sentence: string;
    meaning: string;
    reading: string;
  };
};

export class ApiClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async getSentenceMeaning(
    sentence: SentenceCard
  ): Promise<SentenceMeaningAPIResponse> {
    const requestBody = { text: sentence.text };
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
}
