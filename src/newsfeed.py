# app.py
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import os
from dotenv import load_dotenv
import asyncio
from src.sentimentAnalysis import score_headlines

load_dotenv()  # load .env file

backup_data = [{"title":"Bloomberg: Nations Race to Secure Enough Fertilizer and Prevent Food Crisis","description":"Fertilizers waiting to be loaded onto ships this week in China’s Shandong Province.Source: CFOTO/Future Publishing/Getty ImagesGovernments are rushing to secure supplies of critical crop nutrients ahead of spring planting, as the Middle East war chokes off th…","url":"https://i-epikaira.blogspot.com/2026/03/bloomberg-nations-race-to-secure-enough.html"},{"title":"Are trace drugs getting into produce? #food","description":"Trace pharmaceuticals in crops: what scientists are studying Researchers are investigating whether trace drugs can make their way into produce through water reuse—especially in water scarce regions where treated wastewater is used in agriculture. The concern …","url":"https://alltoc.com/food/are-trace-drugs-getting-into-produce"},{"title":"Hydrofarm Holdings Group Announces Fourth Quarter and Full Year 2025 Results","description":"Hydrofarm Holdings Group Announces Fourth Quarter and Full Year 2025 Results...","url":"https://www.globenewswire.com/news-release/2026/03/27/3263733/0/en/Hydrofarm-Holdings-Group-Announces-Fourth-Quarter-and-Full-Year-2025-Results.html"},{"title":"Associated Press: The war in Iran sparks a global fertilizer shortage and threatens food prices","description":"BY ANIRUDDHA GHOSAL AND ALLAN OLINGOHANOI, Vietnam (AP) — Farmers around the world are feeling the squeeze of the Iran war. Gas prices have shot up and fertilizer supplies are waning due to Tehran’s near shutdown of the Strait of Hormuz in retaliation for U.S…","url":"https://i-epikaira.blogspot.com/2026/03/asociated-press-war-in-iran-sparks.html"},{"title":"The Best Nike Sneakers Releasing in April","description":"Including new colorways of the sold-out Mind 001 and the Nike Kobe 11 Protro \"Mamba Day.\"","url":"http://wwd.com/footwear-news/sneaker-news/nike-sneaker-release-date-calendar-april-2026-1238690532/"},{"title":"Titans land offensive star in new CBS mock draft","description":"The NFL Draft is right around the corner, and CBS Sports' Josh Edwards believes the Titans will pick Notre Dame running back Jeremiyah Love.","url":"https://titanswire.usatoday.com/story/sports/nfl/titans/2026/03/27/jeremiyah-love-tennessee-titans-nfl-draft/89341708007/"},{"title":"India eyes tulip self-reliance as Kashmir project gathers pace","description":"Officials say that developing indigenous varieties and strengthening local bulb production could significantly reduce costs and ensure a more sustainable supply chain","url":"https://www.thehindubusinessline.com/economy/agri-business/india-eyes-tulip-self-reliance-as-kashmir-project-gathers-pace/article70792251.ece"},{"title":"What if I told you the ‘AI slop’ debate was over 100 years old? It used to be about ‘ghostwriting’","description":"In the late 19th century, a sculptor went to court to rebut a claim that his \"ghost\" assistant had completed sculptures for which the sculptor took credit","url":"https://fortune.com/2026/03/27/ai-backlash-slop-debate-ghostwriting-history-plagiarism-cheating/"},{"title":"A New AI Documentary Puts CEOs in the Hot Seat—but Goes Too Easy on Them","description":"“The AI Doc: Or How I Became an Apocaloptimist” seeks the middle ground on a polarizing technology—and ends up letting tech execs like Sam Altman off the hook.","url":"https://www.wired.com/story/a-new-ai-documentary-puts-ceos-in-the-hot-seat-but-goes-too-easy-on-them/"},{"title":"iOS 26.4 expands Apple Intelligence, adds smarter translation, creator tools and more","description":"Apple's iOS 26.4 update, released in March 2026, enhances everyday iPhone use with practical Apple Intelligence features like expanded Live Translation and improved Hold Assist.","url":"https://economictimes.indiatimes.com/magazines/panache/ios-26-4-expands-apple-intelligence-adds-smarter-translation-creator-tools-and-more/articleshow/129845125.cms"}]

NEWS_API_KEY = os.getenv("NEWS_API")


app = FastAPI(title="Crop News API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

class NewsArticle(BaseModel):
    title: str
    description: str | None
    url: str

@app.get("/api/news", response_model=list[NewsArticle])
async def get_crop_news(
    crop: str = Query(..., description="Crop to search for, e.g., almonds or wheat"),
    limit: int = Query(5, description="Number of articles to return"),
    sort_by: str = Query("publishedAt", description="Sort by: publishedAt, popularity, relevancy")
):
    """
    Fetch latest news articles for a given crop using NewsAPI.
    """
    url = "https://newsapi.org/v2/everything"
    params = {
        "q": crop,
        "apiKey": NEWS_API_KEY,
        "sortBy": sort_by,
        "pageSize": limit,
        "language": "en"
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(url, params=params)
        data = resp.json()

    articles = data.get("articles", [])
    tmp = [
        NewsArticle(
            title=a.get("title", ""),
            description=a.get("description"),
            url=a.get("url"),
            published_at=a.get("publishedAt")
        )
        for a in articles
    ]
    
    return tmp if tmp else [
        NewsArticle(
            title=a.get("title", ""),
            description=a.get("description"),
            url=a.get("url"),
            published_at=a.get("publishedAt")
        )
        for a in backup_data
    ]


@app.get("/api/sentiment")
async def get_crop_sentiment(
    crop: str = Query(..., description="Crop to analyse sentiment for"),
    limit: int = Query(10, description="Number of articles to analyse")
):
    """Fetch news for a crop and return aggregate FinBERT sentiment across headlines."""
    articles = await get_crop_news(crop=crop, limit=limit, sort_by="publishedAt")
    titles = [a.title for a in articles]
    result = await asyncio.to_thread(score_headlines, titles)
    return {"crop": crop, **result}