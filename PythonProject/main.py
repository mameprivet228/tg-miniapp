import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command

TOKEN = "ВСТАВЬ_СЮДА_ТОКЕН_БОТА"
WEBAPP_URL = "https://USERNAME.github.io/tg-21-miniapp/"

bot = Bot(token=TOKEN)
dp = Dispatcher()

@dp.message(Command("start"))
async def start(message: types.Message):
    kb = [
        [types.KeyboardButton(
            text="🎓 Играть в 21 (обучение)",
            web_app=types.WebAppInfo(url=WEBAPP_URL)
        )]
    ]
    keyboard = types.ReplyKeyboardMarkup(
        keyboard=kb,
        resize_keyboard=True
    )

    await message.answer(
        "Это образовательный симулятор игры «21».\n"
        "Без ставок и выигрышей.",
        reply_markup=keyboard
    )

async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())