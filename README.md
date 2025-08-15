# [Star Battle Playground](https://github.com/StarBattleLab/starbattlelab.github.io)

This repository contains a web application for playing and creating Star Battle puzzles, built entirely with client-side technologies (**HTML, CSS, and JavaScript**). The application logic, including puzzle generation and solving, runs in your browser, making it fast and responsive.

-----

## Live Demo

You can play the live version instantly in your browser. No setup is needed.

[**LiveDemo**](https://starbattlelab.github.io/Main/)

-----

## Features

  * **Multiple Interaction Modes**: Seamlessly switch between marking stars, free-form drawing, and creating custom region borders.
  * **Client-Side Solving**: Generate new puzzles and find solutions instantly without any server-side processing.
  * **Advanced UI**: Includes a customizable color picker, adjustable brush sizes, and a responsive layout for both desktop and mobile.
  * **Full History Management**: Robust undo and redo support is available for every action, including marking, drawing, and bordering.
  * **Save & Load**: Save your puzzle progress, including all marks and drawings, to your browser's local storage and load it back later.
  * **Import & Export**: Share puzzles with others using the compact Star Battle Notation (SBN) format.
  * **Smart Assists**: Enable settings like automatic error highlighting and "Auto-X" to fill in logical deductions for you.

-----

## Running Locally

While the application logic is fully client-side, modern web browsers have security policies (CORS) that restrict loading resources from the local file system. Therefore, to run the app locally, you must serve the files from the project's `Main` directory using a simple local web server.

1.  **Clone the repository** to your local machine.
2.  **Navigate into the `Main` directory** in your terminal. For example:
    ```bash
    cd path/to/StarbattlesTools/Main
    ```
3.  **Start a local server** using one of the options below.

### Option A: Using Node.js (Recommended)

If you have Node.js and npm installed, you can use `npx` to run a temporary server without installing any packages globally. This is a quick and modern approach.

```bash
npx serve
```

### Option B: Using Python

If you have Python installed, you can use its simple built-in web server.

  * For **Python 3**:
    ```bash
    python3 -m http.server
    ```
  * If you have an older system with **Python 2**:
    ```bash
    python -m SimpleHTTPServer
    ```

<!-- end list -->

4.  **Open the application in your browser**. After running the server command, your terminal will display a local URL. Open that URL (typically `http://localhost:3000` for `npx serve` or `http://localhost:8000` for Python) in your browser to run the app.

-----

## Miscellaneous Tools

This repository also includes a `MiscTools/` folder. This directory contains a collection of various scripts and utilities that are not part of the core puzzle application but may be useful for advanced users or for performing other interesting tasks. Feel free to explore them if you're curious.
