import requests


def checkForMaliciousPrompt(query):
    response = requests.get(
        "http://api.example.com/aiquerycheck",
        params={"query": query}
    )
    result = response.json()
    return result.get("safe", False)


def send_ai_query(query):
    response = requests.get(
        "http://api.example.com/aiqueryrun",
        params={"query": query}
    )
    return response.json()
