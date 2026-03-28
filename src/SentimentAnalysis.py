from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

_tokenizer = None
_model = None

def _load_model():
    global _tokenizer, _model
    if _tokenizer is None:
        _tokenizer = AutoTokenizer.from_pretrained("yiyanghkust/finbert-tone")
        _model = AutoModelForSequenceClassification.from_pretrained("yiyanghkust/finbert-tone")

def score_headlines(titles: list[str]) -> dict:
    """
    Score a list of headlines with FinBERT.

    Returns:
        sentiment: "positive" | "neutral" | "negative"
        score:     float from -1.0 (fully negative) to +1.0 (fully positive)
        articles_analysed: int
    """
    _load_model()

    scores = []
    for title in titles:
        if not title or len(title) < 5:
            continue
        inputs = _tokenizer(title, return_tensors="pt", truncation=True, max_length=512)
        with torch.no_grad():
            logits = _model(**inputs).logits
        pos, _, neg = torch.softmax(logits, dim=-1).squeeze().tolist()
        scores.append(pos - neg)

    avg = sum(scores) / len(scores) if scores else 0
    label = "positive" if avg > 0 else "negative" if avg < 0 else "neutral"

    return {
        "sentiment": label,
        "score": round(avg, 4),
        "articles_analysed": len(scores),
    }
