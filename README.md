# China Stock Analyzer 🏮📈

A professional AI-powered web application for analyzing Chinese stock market events and generating comprehensive daily reports.

## Features ✨

- **Real-time Stock Analysis**: Generate detailed reports on Chinese A-shares market events
- **GPT-5-thinking-all Integration**: Leverages advanced AI model with visible thinking process
- **Dual Display Mode**: Shows both AI thinking process and final analysis results
- **Streaming Response**: Real-time content generation with visual feedback
- **Download & Export**: One-click download of analysis reports in TXT format
- **Bilingual Interface**: Chinese interface with English codebase

## Tech Stack 🛠

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **AI Model**: GPT-5-thinking-all via Tu-zi API
- **Proxy Server**: Node.js + Express + Axios
- **Streaming**: Server-Sent Events (SSE)
- **Deployment**: Vercel

## Installation 📦

1. Clone the repository:
```bash
git clone https://github.com/Imd11/china-stock-analyzer.git
cd china-stock-analyzer
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Start the proxy server (in a new terminal):
```bash
npm run proxy-axios
```

5. Open your browser and navigate to:
```
http://127.0.0.1:3000
```

## Scripts 📜

- `npm run dev` - Start the frontend development server
- `npm run proxy` - Start the basic proxy server
- `npm run proxy-stream` - Start the streaming proxy server
- `npm run proxy-axios` - Start the Axios-based streaming proxy server (recommended)

## Configuration ⚙️

The application uses the Tu-zi API for GPT-5-thinking-all model access.

Two integration modes are supported:
- Secure proxy/server (recommended): Frontend calls `/api/chat` (Vercel) or local proxy; API key lives in env vars.
- Direct client call (not recommended): Enable `USE_DIRECT_API` in `script-thinking.js` or `script-stream.js` and set `DIRECT_API_KEY`. This exposes the key to all users and may incur abuse and cost. CORS must be allowed by the API provider. The code will auto-fallback to `/api/chat` if direct call fails.

## Features in Detail 🔍

### AI Thinking Process Display
- Shows the complete thought process of GPT-5-thinking-all
- Includes search queries, analysis logic, and decision-making steps
- Collapsible interface for better user experience

### Final Report Generation
- Structured market data analysis
- Company events tracking (5 major events)
- Macro policy analysis (3 policies)
- Hot sector performance
- North/Southbound capital flows

### Export Options
- **Copy to Clipboard**: One-click copy of the final report
- **Download as TXT**: Save reports locally with date-stamped filenames

## Project Structure 📁

```
china-stock-analyzer/
├── index.html              # Main HTML file
├── style-thinking.css      # Styles with thinking process support
├── script-thinking.js      # Main JavaScript with dual display
├── proxy-server-axios.js   # Axios-based streaming proxy
├── package.json            # Project dependencies
└── README.md              # This file
```

## Development 💻

### Adding New Features
1. Modify the prompt template in `script-thinking.js`
2. Update styles in `style-thinking.css`
3. Test with the development server

### API Integration
The proxy server handles CORS and streaming from the Tu-zi API. Modify `proxy-server-axios.js` for API changes.

## Deployment 🚀

### Vercel Deployment
The project is configured for easy deployment on Vercel:

1. Push to GitHub
2. Import project in Vercel
3. Deploy with default settings

### Environment Variables
Set these in your local `.env` and in Vercel Project Settings > Environment Variables:
- `TUZI_API_KEY`: Your Tu-zi API key (required)
- `TUZI_API_URL` (optional): Defaults to `https://api.tu-zi.com/v1/chat/completions`

Security note: No API key is kept in frontend code; all calls route through a proxy or the Vercel `api/chat` serverless function which reads keys from env.

## License 📄

MIT License - feel free to use this project for personal or commercial purposes.

## Contributing 🤝

Contributions are welcome! Please feel free to submit a Pull Request.

## Support 💬

For issues or questions, please open an issue on GitHub.

---

**Note**: This application is designed for educational and analytical purposes. Always verify financial information from official sources before making investment decisions.

## Screenshots 📸

### Main Interface
The application features a clean, professional interface with date selection and real-time analysis generation.

### Thinking Process Display
Watch the AI's thought process in real-time as it analyzes market data and searches for information.

### Final Report
Get comprehensive, structured reports with specific data points and market insights.

---

Built with ❤️ for the Chinese stock market analysis community
