from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class Question(BaseModel):
    text: str


@app.get("/")
def hello():
    return {"message": "Hello AI!"}


@app.post("/ask")
def ask(q: Question):
    # A stand-in for a model call, so the demo needs no API key
    return {"answer": f"You asked: {q.text}"}
