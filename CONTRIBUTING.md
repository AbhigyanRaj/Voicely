# Contributing to Voicely

First off, thank you for considering contributing to Voicely! It's people like you that make open-source such a great community to learn, inspire, and create.

## Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct. Please be respectful, welcoming, and inclusive to all contributors.

## How Can I Contribute?

### Reporting Bugs

- Ensure the bug was not already reported by searching on GitHub under Issues.
- If you're unable to find an open issue addressing the problem, open a new one. Be sure to include a title and clear description, as much relevant information as possible, and a code sample or an executable test case demonstrating the expected behavior that is not occurring.

### Suggesting Enhancements

- Open a new issue with a clear title and description.
- Explain why this enhancement would be useful to most users.
- If you have an idea of how it could be implemented, please include a rough design or pseudo-code.

### Pull Requests

1. **Fork the repo** and create your branch from `main`.
2. **Install dependencies** in both `frontend` and `backend` directories.
3. **Make your changes**. If you've added code that should be tested, add tests!
4. **Ensure the test suite passes**. Run `npm test` in the backend.
5. **Format your code**. Ensure your code adheres to the existing styling.
6. **Issue that pull request!**

## Development Setup

See the [README.md](README.md) for detailed setup instructions. To run the full stack locally:

1. Copy `.env.example` to `.env` in the backend and fill out required variables.
2. In the root directory, install concurrent tools if you'd like to run both at once:
   ```bash
   npm install
   npm run dev
   ```

## Architecture

Voicely is a monolith consisting of:
- **Frontend**: React + Vite (Tailwind CSS)
- **Backend**: Node.js + Express
- **Database**: MongoDB

Feel free to ask questions in the Discussions tab if you need architectural guidance before opening a PR!
