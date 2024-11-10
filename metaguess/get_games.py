import mysql.connector
from bs4 import BeautifulSoup
import requests
import re
import time


class MetacriticScraper:
    def __init__(self):
        # User-Agent and Metacritic scraping setup
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        self.base_url = "https://www.metacritic.com/browse/game/?releaseYearMin=1958&releaseYearMax=2024&page="
        self.page_quantity = 562

        # IGDB API configuration
        self.igdb_client_id = ''
        self.igdb_access_token = ''

        # MySQL connection details
        self.mysql_config = {
            'host': 'localhost',
            'user': '',
            'password': '',
            'database': ''
        }

    def query_igdb_for_game(self, game_name):
        """Queries IGDB for platform and cover URL for a given game name."""
        # Remove year if present in game name, e.g., "Resident Evil 4 (2005)" -> "Resident Evil 4"
        cleaned_name = re.sub(r"\s\(\d{4}\)$", "", game_name)

        url = "https://api.igdb.com/v4/games"
        headers = {
            "Client-ID": self.igdb_client_id,
            "Authorization": f"Bearer {self.igdb_access_token}"
        }
        data = f'fields platforms.name, cover.url; where name = "{cleaned_name}"; limit 1;'
        response = requests.post(url, headers=headers, data=data)

        if response.status_code == 200:
            results = response.json()
            if results:
                # Extract platform names and cover URL
                platforms = [platform['name'] for platform in results[0].get('platforms', [])]

                # Modify cover URL to use "t_cover_big" size instead of "t_thumb"
                cover = results[0].get('cover', {}).get('url', None)
                if cover:
                    cover_url = cover.replace("t_thumb", "t_cover_big")
                else:
                    cover_url = None

                return platforms, cover_url
        else:
            print(f"IGDB API request failed with status code {response.status_code}")

        return None, None

    def update_game_in_db(self, game_id, platform, cover_url):
        """Updates a game's platform and cover URL in the database."""
        try:
            db = mysql.connector.connect(**self.mysql_config)
            cursor = db.cursor()

            # Update platform and cover URL for a game
            sql = """
                UPDATE games SET platform = %s, cover_url = %s WHERE id = %s
            """
            values = (platform, cover_url, game_id)
            cursor.execute(sql, values)
            db.commit()

            print(f"Updated game ID {game_id} with platform {platform} and cover URL.")
            cursor.close()
            db.close()
        except mysql.connector.Error as e:
            print(f"Error updating game in database: {e}")

    def fetch_and_update_missing_data(self):
        """Fetches games with missing data from the database and updates them."""
        try:
            db = mysql.connector.connect(**self.mysql_config)
            cursor = db.cursor()

            # Select games with missing platform or cover URL
            cursor.execute("SELECT id, game_name FROM games WHERE platform IS NULL OR cover_url IS NULL")
            games = cursor.fetchall()

            for game_id, game_name in games:
                # Query IGDB for platform and cover URL
                platforms, cover_url = self.query_igdb_for_game(game_name)

                if platforms or cover_url:
                    # Join platforms list into a single string if it exists
                    platform_str = ', '.join(platforms) if platforms else None
                    self.update_game_in_db(game_id, platform_str, cover_url)

                # Delay to avoid hitting API rate limits
                time.sleep(0.3)

            cursor.close()
            db.close()
        except mysql.connector.Error as e:
            print(f"Error fetching or updating games in database: {e}")

    def scrape_and_save_games(self):
        for index in range(1, self.page_quantity):
            try:
                page_url = self.base_url + str(index)
                response = requests.get(page_url, headers=self.headers)
                #print(response.text)
                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')
                    game_elements = soup.find_all('div', class_='c-finderProductCard c-finderProductCard-game')
                    #print(game_elements)
                    for game in game_elements:
                        try:
                            # Extracting game title
                            title_element = game.find('h3', class_='c-finderProductCard_titleHeading')
                            title = title_element.find_all('span')[1].text.strip() if title_element else None

                            # Extracting release date
                            release_date_element = game.find('div', class_='c-finderProductCard_meta')
                            release_date = release_date_element.find('span').text.strip() if release_date_element else None
                            year = re.search(r'\d{4}', release_date).group() if re.search(r'\d{4}', release_date) else None

                            # Extracting metascore
                            score_element = game.find('div', class_='c-siteReviewScore')
                            score = score_element.text.strip() if score_element else None

                            # Extracting cover image URL
                            cover_img = game.find('div', class_='c-finderProductCard_blurry g-height-100 g-width-100')
                            cover_url = cover_img.get('src') or cover_img.get('data-src') or cover_img.get('data-original')
                            print(cover_url)
                            # Assuming "platform" is not available in this structure, so setting as None or updating accordingly
                            platform = None

                            # Debugging: Print extracted values to check
                            print(f"Parsed game: {title}, Release Year: {year}, Score: {score}, Cover URL: {cover_url}")

                            self.save_game_to_db(title, platform, year, score, cover_url)

                        except Exception as e:
                            print(f"Error processing game: {e}")
                else:
                    print(f"Error fetching data from Metacritic: {response.status_code}")
            except Exception as e:
                print(f"Error scraping Metacritic data: {e}")

    def save_game_to_db(self, game_name, platform, release_year, score, cover_url):
        try:
            # Connect to MySQL database
            db = mysql.connector.connect(**self.mysql_config)
            cursor = db.cursor()

            # Insert game data into the GAMES table
            sql = """
                INSERT INTO games (game_name, platform, release_year, score, cover_url)
                VALUES (%s, %s, %s, %s, %s)
            """
            values = (game_name, platform, release_year, float(score) if score else None, cover_url)
            cursor.execute(sql, values)
            db.commit()

            print(f"Saved game: {game_name}")
            cursor.close()
            db.close()
        except mysql.connector.Error as e:
            print(f"Error saving game to database: {e}")
            print(f"Game data: {game_name}, {platform}, {release_year}, {score}, {cover_url}")

if __name__ == "__main__":
    scraper = MetacriticScraper()

    # Verify database connection
    try:
        db = mysql.connector.connect(**scraper.mysql_config)
        cursor = db.cursor()
        cursor.execute("SELECT 1 FROM games LIMIT 1")
        result = cursor.fetchone()
        if result:
            print("Database connection and table structure are OK.")
        else:
            print("Database connection is OK, but the GAMES table is empty.")
        cursor.close()
        db.close()
    except mysql.connector.Error as e:
        print(f"Error connecting to the database: {e}")
        exit(1)

    #scraper.scrape_and_save_games()
    print("Scraping and database upload complete.")
    scraper.fetch_and_update_missing_data()
    print("Data update for missing platform and cover URLs complete.")