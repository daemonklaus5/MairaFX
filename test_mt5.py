import MetaTrader5 as mt5
import sys

print("Initializing MT5...")
if not mt5.initialize():
    print("initialize() failed, error code =", mt5.last_error())
    sys.exit(1)

print("Logging in...")
authorized = mt5.login(
    login=318478297, 
    server="XMGlobal-MT5 7", 
    password="Xm.com@9966*"
)

if authorized:
    print("Successfully connected to MT5 account")
    account_info = mt5.account_info()
    print("Account info:", account_info)
    
    # Check a symbol
    sym = "EURUSD"
    tick = mt5.symbol_info_tick(sym)
    print(f"Current tick for {sym}:", tick)
else:
    print("failed to connect at account, error code =", mt5.last_error())

mt5.shutdown()
