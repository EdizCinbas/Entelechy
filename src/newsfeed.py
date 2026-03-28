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

backup_data = [
    {
        "title": "Carrot Cake Bars",
        "description": "This easy Carrot Cake Bars recipe with a cheesecake swirl is a simple spring dessert made with fresh carrots, brown sugar, cinnamon, and cream cheese!\nThe post Carrot Cake Bars appeared first on Budget Bytes.",
        "url": "https://www.budgetbytes.com/carrot-cake-bars/"
    },
    {
        "title": "3 Underrated Nuts With Surprising Health Benefits (& How To Eat Them Daily)",
        "description": "Time to make space in your pantry",
        "url": "https://www.mindbodygreen.com/articles/stock-your-pantry-with-these-3-underrated-nuts"
    },
    {
        "title": "Top food sources of magnesium for sleep, stress and blood pressure",
        "description": "Magnesium deficiency is widespread and linked to numerous chronic diseases and depression. New clinical research shows magnesium supplementation rapidly improves depression and anxiety symptoms. Standard blood tests often fail to detect a magnesium deficiency…",
        "url": "https://www.naturalnews.com/2026-03-27-sources-magnesium-sleep-stress-blood-pressure.html"
    },
    {
        "title": "High-Protein Nuts and Seeds Listed as Natural Dietary Options",
        "description": "Nine Plant Sources Ranked by Protein Content A list identifying nine nuts and seeds with the highest concentrations of plant-based protein has been compiled from nutritional data. The ranking is based on protein content per standard 100-gram serving, accordin…",
        "url": "https://www.naturalnews.com/2026-03-27-nuts-and-seeds-as-natural-protein-sources.html"
    },
    {
        "title": "Scientists uncovered the nutrients bees were missing — Colonies surged 15-fold",
        "description": "Scientists have developed a breakthrough “superfood” for honeybees by engineering yeast to produce the essential nutrients normally found in pollen. In controlled trials, colonies fed this specially designed diet produced up to 15 times more young, showing a …",
        "url": "https://www.sciencedaily.com/releases/2026/03/260327000518.htm"
    },
    {
        "title": "Squirrels love almonds, and will work harder to get them",
        "description": "Pumpkin seeds, on the other hand, are just kind of meh.\nThe post Squirrels love almonds, and will work harder to get them appeared first on Popular Science.",
        "url": "http://www.popsci.com/environment/squirrels-love-almonds-snacks/"
    },
    {
        "title": "Banana Cottage Cheese Muffins",
        "description": "These banana cottage cheese muffins are kid-friendly, high protein and so easy to make! The perfect addition to breakfast or snack time! Hi friends! I’ve got a new muffin recipe to share with you guys today. My daughter has been loving them lately and I love …",
        "url": "https://www.theleangreenbean.com/banana-cottage-cheese-muffins/"
    },
    {
        "title": "Neiman Marcus Chicken Salad Recipe - creamy, cheesy, and packed with flavor! Made with tender chicken, crispy bacon, crunchy almonds, green onions, and a rich mayo dressing with a little kick. Perfect for sandwiches, croissants, crackers, or meal prep lunches. Easy to make and always a crowd favorite.",
        "description": "Neiman Marcus Chicken Salad Recipe - creamy, cheesy, and packed with flavor! Made with tender chicken, crispy bacon, crunchy almonds, green onions, and a rich mayo dressing with a little kick. Perfect for sandwiches, croissants, crackers, or meal prep lunches…",
        "url": "https://www.pinterest.com/pin/273171533645148396/"
    },
    {
        "title": "A Cardiologist's 3 Favorite High-Protein Foods for Better Heart Health",
        "description": "Protein helps people feel full, lose weight and improve athletic performance. A cardiologist shares her favorite heart-healthy protein, including almonds.",
        "url": "https://www.today.com/health/diet-fitness/high-protein-foods-cardiologist-tip-rcna265110"
    },
    {
        "title": "6 oats breakfasts for lasting morning energy",
        "description": "Overnight oats don't always have to be sweet; the savory version is a game-changer for the Indian palate. By soaking rolled oats with a handful of sprouted moong, you create a breakfast that is exceptionally high in both fiber and plant-based protein. A dash …",
        "url": "https://m.economictimes.com/news/india/6-oats-breakfasts-for-lasting-morning-energy/overnight-masala-oats-with-sprouted-moong/slideshow/129823894.cms"
    },
    {
        "title": "Natureâs anti-aging secrets: Top foods to keep skin youthful and radiant",
        "description": "Nutrient-rich foods help combat wrinkles, sagging and dullness by fighting oxidative stress, boosting collagen production and reducing inflammation. Foods high in antioxidants (vitamins C and E and polyphenols) neutralize free radicals, while collagen-support…",
        "url": "https://www.naturalnews.com/2026-03-26-top-foods-to-keep-skin-youthful-radiant.html"
    },
    {
        "title": "Vrat Special Makhana Namkeen recipe : Healthy Crunch Snack or Hidden Diet Risk? - Newstracker24x7",
        "description": "Vrat Special Makhana Namkeen recipe : During fasting festivals such as Navratri, people favor light and clean foods. Makhana namkeen has become a popular food during vrat days. With the use of an air fryer, this traditional snack is now easier and healthier t…",
        "url": "https://newstracker24x7.com/vrat-makhana-namkeen-recipe-healthy-snack/"
    },
    {
        "title": "The 6 Best High-Protein Cheeses. Period.",
        "description": "Cheese is high in protein. These six cheese contain strong amounts of the muscle-building nutrient, but also taste delicious.",
        "url": "https://www.menshealth.com/nutrition/a70697193/best-high-protein-cheeses/"
    },
    {
        "title": "REVIEW: Should You SKIP This Controversial Disney World Restaurant?",
        "description": "This table service restaurant is pretty controversial, but is it worth dining here on your next vacation? We're finding out!",
        "url": "https://allears.net/2026/03/25/review-should-you-skip-this-controversial-disney-world-restaurant/"
    },
    {
        "title": "This Nutrient Deficiency May Be Linked to Higher Alzheimer’s Risk, Study Finds",
        "description": "Start incorporating more of these foods for better brain health.",
        "url": "https://www.eatingwell.com/choline-alzheimers-study-11928618"
    },
    {
        "title": "Why getting active matters for your body and mind",
        "description": "Why getting active matters for your body and minddaytondailynews.com",
        "url": "https://www.daytondailynews.com/lifestyles/why-getting-active-matters-for-your-body-and-mind/RAKXLAHETZCSPDTXSRKZZYTGPQ/"
    },
    {
        "title": "M&S Transforms Cereal Range As Customers Seek Healthy Nutrition - Supermarket News",
        "description": "M&S has transformed its staple ranges across its Food halls, and its new cereals range, including granola, mueslis and porridge pots",
        "url": "https://supermarketnews.co.nz/global/ms-transforms-cereal-range-as-customers-seek-healthy-nutrition/"
    },
    {
        "title": "A Dietitian Shares Her No. 1 Favorite Plant-Based Protein Snack",
        "description": "A small snack can pack a ton of healthy nutrients to keep you full and energized. Look for this plant-based protein for a satisfying snack, a dietitian says.",
        "url": "https://www.today.com/health/diet-fitness/healthiest-plant-based-protein-snack-rcna264326"
    },
    {
        "title": "There are proteins that are better for you. Here’s the foods that should be in your diet",
        "description": "Two-thirds of Americans’ daily protein already comes from meat",
        "url": "https://www.the-independent.com/life-style/health-and-families/protein-types-fiber-meat-legumes-experts-b2944751.html"
    },
    {
        "title": "Review & Giveaway: Beverly Marumi Notebooks",
        "description": "In the last few weeks I took a spin through some of the new products at JetPens in an attempt to find some small purchases – a bit of fun to liven things up. One of the things I came across was Beverly Marumi Notebooks ($6.50-$9.50 at JetPens). They are perfe…",
        "url": "https://www.wellappointeddesk.com/2026/03/review-giveaway-beverly-marumi-notebooks/"
    },
    {
        "title": "New Research Suggests Eating More of These Foods Could Reduce Stroke Risk by 20%",
        "description": "Experts break down the latest study linking higher vitamin B levels to a lower risk of stroke.",
        "url": "https://www.womenshealthmag.com/health/a70823305/higher-b-vitamin-levels-lower-stroke-risk/"
    },
    {
        "title": "Dull skin, pigmentation, ageing? Delhi nutritionist shares 6 simple foods for healthy and glowing skin",
        "description": "Nutritionist Loveneet Batra reveals six powerhouse foods to combat dullness, pigmentation, and ageing.  Discover how figs with milk, homemade paneer, kesar with goat milk, amla juice, soaked almonds, and beetroot-aloe vera juice can naturally restore your ski…",
        "url": "https://economictimes.indiatimes.com/magazines/panache/dull-skin-pigmentation-ageing-delhi-nutritionist-shares-6-simple-foods-for-healthy-and-glowing-skin/articleshow/129771359.cms"
    },
    {
        "title": "Diet over dermatology: Simple food swaps that can transform your skin",
        "description": "Emerging research shows diet significantly impacts skin health, with inflammation, gut imbalances and nutrient deficiencies underlying acne, eczema and premature aging. Poor dietary choices disrupt gut bacteria, triggering inflammatory skin conditions, while …",
        "url": "https://www.naturalnews.com/2026-03-24-simple-food-swaps-to-transform-your-skin.html"
    },
    {
        "title": "Whitewater Mountain Resort: Why this low-tech BC ski field is worth the trip",
        "description": "The resort offers 1314ha, 113 runs and famous glade and touring terrain.",
        "url": "https://www.nzherald.co.nz/travel/whitewater-mountain-resort-why-this-low-tech-bc-ski-field-is-worth-the-trip/2VWSWPFKJJGYVJMEPBO4CEAP2Q/"
    },
    {
        "title": "19 Genius Ways To Use Greek Yogurt For High-Protein Meals (Beyond Just Breakfast)",
        "description": "Though somewhat eclipsed from the culinary mainstream by its chunkier counterpart, cottage cheese, Greek yogurt still stands strong in our minds (and kitchens). Like cottage cheese gets thrown into homemade ice creams, pastas, and dips, Greek yogurt is a main…",
        "url": "https://www.brit.co/best-greek-yogurt-recipes-protein/"
    },
    {
        "title": "REVIEW: Why You’ll Always Find Me at EPCOT’s Mexico Pavilion…And NOT JUST For Margaritas",
        "description": "We sat down inside EPCOT’s “forever nighttime” restaurant to see what it’s really like -- and whether it (and its new menu items) deserve a spot on your must-do dining list.",
        "url": "https://allears.net/2026/03/23/review-why-youll-always-find-me-at-epcots-mexico-pavilion-and-not-just-for-margaritas/"
    },
    {
        "title": "6 fruit-based breakfasts to prevent midday fatigue",
        "description": "Bananas are nature’s energy bars, providing quick-acting carbohydrates, while walnuts offer the healthy fats needed to slow down sugar absorption. This combination in a warm bowl of steel-cut oats ensures that the energy from the fruit is released gradually o…",
        "url": "https://m.economictimes.com/news/india/6-fruit-based-breakfasts-to-prevent-midday-fatigue/banana-and-walnut-oatmeal-bowl/slideshow/129752562.cms"
    },
    {
        "title": "No-Bake Peanut Butter Oat Bars",
        "description": "These No-Bake Peanut Butter Oat Bars are a quick, chewy, and chocolate-topped treat you can make with ingredients you probably already have in your pantry! No baking required, just mix, press, and chill!",
        "url": "https://iambaker.net/no-bake-peanut-butter-oat-bars/"
    },
    {
        "title": "The silent epidemic: Are you missing these key nutrients?",
        "description": "Processed foods and depleted soils lead to silent nutrient shortages (magnesium, B12, choline, vitamin D, iron, potassium, vitamin A, B6, selenium), causing fatigue, weakened immunity and chronic issues. Nearly 50% of people are deficient in magnesium, leadin…",
        "url": "https://www.naturalnews.com/2026-03-23-silent-epidemic-are-you-missing-key-nutrients.html"
    }
]

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
    limit: int = Query(100, description="Number of articles to return"),
    sort_by: str = Query("publishedAt", description="Sort by: publishedAt, popularity, relevancy")
):
    """
    Fetch latest news articles for a given crop using NewsAPI.
    """
    # url = "https://newsapi.org/v2/everything"
    # params = {
    #     "q": crop,
    #     "apiKey": NEWS_API_KEY,
    #     "sortBy": sort_by,
    #     "pageSize": limit,
    #     "language": "en"
    # }
    # async with httpx.AsyncClient(timeout=20.0) as client:
    #     resp = await client.get(url, params=params)
    #     data = resp.json()

    # articles = data.get("articles", [])
    # tmp = [
    #     NewsArticle(
    #         title=a.get("title", ""),
    #         description=a.get("description"),
    #         url=a.get("url"),
    #     )
    #     for a in articles
    # ]
    tmp = [
        NewsArticle(
            title=a.get("title", ""),
            description=a.get("description"),
            url=a.get("url"),
        )
        for a in backup_data
    ]
    # return tmp if len(tmp) > 0 else backup_data
    
    return tmp


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