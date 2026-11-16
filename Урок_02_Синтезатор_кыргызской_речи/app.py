"""Синтезатор кыргызской речи.

Голоса Mamtil (Ulutsoft, Matcha-TTS) + модели MMS-TTS (Meta) для сравнения.
Интерфейс: Gradio. Числа превращаются в слова, есть словарь произношения.

Подготовка (один раз):
    git clone https://github.com/ramput-labs/kyrgyz-tts-mini.git
    pip install -r kyrgyz-tts-mini/requirements.txt
    pip install -r requirements.txt
    cd kyrgyz-tts-mini && python -m kyrgyz_tts_mini download && cd ..
Запуск:
    python app.py
"""
import os, sys, re
import numpy as np, torch, gradio as gr
from transformers import pipeline

# ---------- Подключение пакета kyrgyz-tts-mini ----------
HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
for cand in (os.path.join(HERE, "kyrgyz-tts-mini"), os.path.join(os.getcwd(), "kyrgyz-tts-mini"), os.getcwd()):
    if os.path.isdir(os.path.join(cand, "kyrgyz_tts_mini")):
        os.chdir(cand)
        sys.path.insert(0, cand)
        break
else:
    raise SystemExit("Папка kyrgyz-tts-mini не найдена. Сделай git clone (см. начало файла).")

from kyrgyz_tts_mini.config import Settings
from kyrgyz_tts_mini.engine import get_tts

# ---------- Словарь произношения (заполняет носитель языка) ----------
# Слева: как слово написано. Справа: как оно произносится.
SPOKEN = {
    "жыйырма": "жырма",
}
_spoken_re = re.compile(
    r"\b(" + "|".join(sorted(map(re.escape, SPOKEN), key=len, reverse=True)) + ")"
) if SPOKEN else None

def apply_spoken(t):
    return _spoken_re.sub(lambda m: SPOKEN[m.group(1)], t) if _spoken_re else t

# ---------- Числа в слова ----------
ones = ["", "бир", "эки", "үч", "төрт", "беш", "алты", "жети", "сегиз", "тогуз"]
tens = ["", "он", "жыйырма", "отуз", "кырк", "элүү", "алтымыш", "жетимиш", "сексен", "токсон"]

def num_to_words(n):
    if n == 0: return "нөл"
    parts = []
    if n >= 1_000_000:
        parts.append(num_to_words(n // 1_000_000) + " миллион"); n %= 1_000_000
    if n >= 1000:
        th = n // 1000
        parts.append(("" if th == 1 else num_to_words(th) + " ") + "миң"); n %= 1000
    if n >= 100:
        h = n // 100
        parts.append(("" if h == 1 else ones[h] + " ") + "жүз"); n %= 100
    if n >= 10:
        parts.append(tens[n // 10]); n %= 10
    if n > 0: parts.append(ones[n])
    return " ".join(p for p in parts if p)

def normalize(text):
    t = text.lower()
    t = re.sub(r"\d+", lambda m: " " + num_to_words(int(m.group())) + " ", t)
    t = t.replace("%", " пайыз ")
    t = re.sub(r"[-–—«»\"“”()]", " ", t)
    t = apply_spoken(t)
    return re.sub(r"\s+", " ", t).strip()

def split_sentences(t):
    return [s.strip() for s in re.split(r"[.!?;:\n]+", t) if s.strip()]

# ---------- Модели (грузятся при первом использовании) ----------
_cache = {}
def get_matcha():
    if "matcha" not in _cache: _cache["matcha"] = get_tts()
    return _cache["matcha"]

def get_mms(name):
    if name not in _cache: _cache[name] = pipeline("text-to-speech", model=name)
    return _cache[name]

VOICES = {
    "Женский голос (Mamtil, лучший)": ("matcha", "woman"),
    "Мужской голос (Mamtil)": ("matcha", "man"),
    "MMS дообученная (kyrgyz-ai)": ("mms", "kyrgyz-ai/TTS_small"),
    "MMS базовая (для сравнения)": ("mms", "facebook/mms-tts-kir"),
}

def to_np(a):
    if hasattr(a, "detach"): a = a.detach().cpu().numpy()
    return np.squeeze(np.asarray(a, dtype=np.float32))

def synth_sentence(s, voice, speed, temp, steps, seed):
    kind, ident = VOICES[voice]
    torch.manual_seed(int(seed))
    if kind == "matcha":
        try:
            cfg = Settings(rate=1.0 / speed, temperature=temp, steps=int(steps))
        except TypeError:
            cfg = Settings(rate=1.0 / speed, temperature=temp)
        sp = get_matcha().synthesize(s, ident, cfg)
        return to_np(sp.audio), int(sp.sample_rate)
    pipe = get_mms(ident)
    pipe.model.speaking_rate = speed
    pipe.model.noise_scale = temp
    pipe.model.noise_scale_duration = 0.6
    out = pipe(s.replace(",", ""))
    return to_np(out["audio"]), int(out["sampling_rate"])

def speak(text, voice, speed, temp, steps, pause, pitch, volume, seed):
    if not text or not text.strip():
        raise gr.Error("Текст жазыңыз / Введите текст")
    chunks, sr = [], None
    for s in split_sentences(normalize(text)):
        wav, sr = synth_sentence(s, voice, speed, temp, steps, seed)
        chunks += [wav, np.zeros(int(sr * pause), dtype=np.float32)]
    audio = np.concatenate(chunks)
    if pitch != 0:
        try:
            import librosa
            audio = librosa.effects.pitch_shift(audio, sr=sr, n_steps=float(pitch))
        except Exception:
            pass
    return sr, np.clip(audio * volume, -1.0, 1.0)

# ---------- Интерфейс ----------
CSS = """
footer, .footer, #footer {display: none !important;}
.gradio-container {max-width: 1000px !important; margin: auto;}
.hero {text-align:center; padding: 22px 10px 8px;}
.hero h1 {font-size: 2rem; margin: 0; background: linear-gradient(90deg,#e8112d,#f5a623);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;}
.hero p {opacity: .75; margin: 6px 0 0;}
"""
HEADER = f"""<style>{CSS}</style>
<div class="hero"><h1>🇰🇬 Кыргыз тилин синтездөө</h1>
<p>Кыргызча текстти үнгө айландыруу · Синтезатор кыргызской речи</p></div>"""

examples = [
    ["Саламатсызбы, менин атым Айжан."],
    ["Бишкекте бүгүн 25 градус жылуулук."],
    ["Мен 2026-жылы мектепти бүтүрөм."],
    ["Кыргызстан Борбор Азиядагы кооз тоолуу өлкө."],
    ["Бул синтезатор кыргыз тилинде сүйлөйт."],
]

with gr.Blocks(title="Кыргызский синтезатор речи") as demo:
    gr.HTML(HEADER)
    with gr.Row():
        with gr.Column(scale=5):
            text = gr.Textbox(label="Текст на кыргызском", lines=5, placeholder="Мисалы: Мен 25 жашымын.")
            voice = gr.Radio(list(VOICES.keys()), value=list(VOICES.keys())[0], label="Голос")
            btn = gr.Button("🔊 Озвучить", variant="primary", size="lg")
            gr.Examples(examples, inputs=[text], label="Примеры")
        with gr.Column(scale=4):
            out = gr.Audio(label="Результат (можно скачать)")
            with gr.Accordion("⚙️ Настройки голоса", open=True):
                speed = gr.Slider(0.6, 1.5, value=1.0, step=0.05, label="Скорость (1.0 = обычная)")
                temp = gr.Slider(0.0, 1.0, value=0.667, step=0.05, label="Вариативность (меньше = ровнее)")
                pause = gr.Slider(0.0, 1.0, value=0.25, step=0.05, label="Пауза между предложениями, сек")
                pitch = gr.Slider(-6, 6, value=0, step=0.5, label="Тембр / высота, полутона")
                volume = gr.Slider(0.5, 1.5, value=1.0, step=0.05, label="Громкость")
            with gr.Accordion("🔬 Дополнительно", open=False):
                steps = gr.Slider(4, 30, value=10, step=1, label="Качество Mamtil (шагов; больше = лучше, медленнее)")
                seed = gr.Number(value=555, precision=0, label="Seed (другой вариант звучания)")
    btn.click(speak, [text, voice, speed, temp, steps, pause, pitch, volume, seed], out)

if __name__ == "__main__" or "google.colab" in sys.modules:
    in_colab = "google.colab" in sys.modules
    try:
        demo.launch(share=in_colab, show_api=False)
    except TypeError:
        demo.launch(share=in_colab)
