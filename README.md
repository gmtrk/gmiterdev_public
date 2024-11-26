# My Website Repository

Welcome to the repository for my personal website! This site hosts some interactive web applications that I've developed.

🌐 **Live Site**: [gmiterdev.onrender.com](https://gmiterdev.onrender.com/)

> **Note:** The site is hosted on a free tier, so it may take around **30-50 seconds** to load initially if the server is in a "spun down" state. Thank you for your patience!

---

## Available Applications

Currently, there are two applications available (with more to come in the future!):

### 1. MNIST Playground

An interactive playground where you can test a model trained on the MNIST dataset.

- **Overview**: I trained a custom MNIST model using Keras (see `mnist/train_mnist.py`), and then converted it with TensorFlow.js to allow real-time predictions in the browser. This approach enables predictions without the need for server requests, as all model weights are loaded locally.
- **Future Updates**: Originally, I intended to display the outputs of individual nodes within the network, but encountered some technical challenges. Future updates may include this feature.
- **Tech Stack**: Python, Keras, TensorFlow.js, JavaScript, CSS, HTML

### 2. MetaGuess

A fun game where you guess whether a given Metacritic score is higher or lower than the selected value.

- **Overview**: I created a scraper to gather information on all Metacritic games with more than 7 reviews ([Metacritic Games](https://www.metacritic.com/browse/game/)), including titles, scores, and release years. This data is saved in a SQL database. Anti-scraping measures on Metacritic prevented me from retrieving cover images directly (even when using Selenium). However, I utilized the IGDB API to fetch most game covers and platform details.
- **Updates**: Added a leaderboard, now top 5 scores are saved and displayed after a game over.
- **Future Updates**: Add a movie gamemode.
- **Tech Stack**: Python, JavaScript, SQL, CSS, HTML

---

