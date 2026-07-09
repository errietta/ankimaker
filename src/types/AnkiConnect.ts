export type AnkiConnectResult = {
    error?: string;
    success?: string;
    data?: Record<string, any>;
};

export type AnkiCardInfo = {
    cardId: number;
    question: string;
    answer: string;
    fields: Record<string, { value: string; order: number }>;
};