import io
import pandas as pd
import requests

# Keywords in "Security Name" that identify non-operating equity assets
EXCLUDE_KEYWORDS = [
    "Warrant", "Warrants", "Unit", "Units", "Preferred", "Pref", 
    "Right", "Rights", "Debenture", "Note", "Notes", "Bond", 
    "Fund", "Etf", "Trust", "Depositary Share", "Acquisition Corp"
]

def clean_equity_df(df, name_col):
    """Filters out non-operating securities, ETFs, test issues, and derivative instruments."""
    # 1. Exclude Test Issues
    if "Test Issue" in df.columns:
        df = df[df["Test Issue"] == "N"]
    
    # 2. Exclude ETFs
    if "ETF" in df.columns:
        df = df[df["ETF"] == "N"]
        
    # 3. Exclude non-common stocks via Security Name
    regex_pattern = "|".join(EXCLUDE_KEYWORDS)
    df = df[~df[name_col].astype(str).str.contains(regex_pattern, case=False, na=False)]
    
    return df

def get_us_tickers():
    print("Fetching US Common Operating Stocks (NASDAQ & NYSE)...")
    nasdaq_url = "ftp://ftp.nasdaqtrader.com/SymbolDirectory/nasdaqlisted.txt"
    other_url = "ftp://ftp.nasdaqtrader.com/SymbolDirectory/otherlisted.txt"

    try:
        # NASDAQ
        nasdaq_df = pd.read_csv(nasdaq_url, sep="|")
        nasdaq_df = nasdaq_df[~nasdaq_df["Symbol"].astype(str).str.contains("File Creation Time", case=False, na=False)]
        nasdaq_df = clean_equity_df(nasdaq_df, "Security Name")
        nasdaq_tickers = nasdaq_df["Symbol"].dropna().str.strip().tolist()

        # NYSE / AMEX
        other_df = pd.read_csv(other_url, sep="|")
        other_df = other_df[~other_df["ACT Symbol"].astype(str).str.contains("File Creation Time", case=False, na=False)]
        nyse_df = other_df[other_df["Exchange"] == "N"]
        nyse_df = clean_equity_df(nyse_df, "Security Name")
        nyse_tickers = nyse_df["ACT Symbol"].dropna().str.strip().tolist()

        with open("nasdaq_tickers.txt", "w") as f:
            f.write("\n".join(sorted(set(nasdaq_tickers))))
        with open("nyse_tickers.txt", "w") as f:
            f.write("\n".join(sorted(set(nyse_tickers))))

        print(f"✓ Saved {len(nasdaq_tickers)} NASDAQ operating stocks to 'nasdaq_tickers.txt'")
        print(f"✓ Saved {len(nyse_tickers)} NYSE operating stocks to 'nyse_tickers.txt'")
    except Exception as e:
        print(f"Error fetching US tickers: {e}")

def get_nse_tickers():
    print("Fetching NSE (India) Common Equity Tickers...")
    url = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "*/*"
    }

    try:
        session = requests.Session()
        session.get("https://www.nseindia.com", headers=headers, timeout=10)
        response = session.get(url, headers=headers, timeout=15)

        if response.status_code == 200:
            df = pd.read_csv(io.BytesIO(response.content))
            # Filter for Equity series ('EQ')
            if "SERIES" in df.columns:
                df = df[df["SERIES"].str.strip() == "EQ"]
                
            nse_tickers = [f"{symbol.strip()}.NS" for symbol in df["SYMBOL"].dropna().tolist()]

            with open("nse_tickers.txt", "w") as f:
                f.write("\n".join(sorted(set(nse_tickers))))
            print(f"✓ Saved {len(nse_tickers)} NSE common equities to 'nse_tickers.txt'")
        else:
            print(f"Failed to reach NSE. Status code: {response.status_code}")
    except Exception as e:
        print(f"Error fetching NSE tickers: {e}")

if __name__ == "__main__":
    get_us_tickers()
    get_nse_tickers()
