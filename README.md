# COSI 116A Group 2 Final Project: Poverty and Education Progress in the UN SDGs

Group Members: Cameron Chase, Zahira Ramirez Caceres, Gianna Crisha Saludo, Ashenaffi Yacob-Haliso

## Hosting the Project

Our project is hosted publicly at [https://cameronchase.net/COSI116A-Group2-Final-Project/](https://cameronchase.net/COSI116A-Group2-Final-Project/).

## Setup

**Under no circumstances should you be editing files via the GitHub user interface.** Do all your edits locally after cloning the repository.

1. Clone this repository to your local machine. E.g., in your terminal / command prompt `CD` to where you want this the folder for this activity to be. Then run `git clone <YOUR_REPO_URL>`

1. `CD` or open a terminal / command prompt window into the cloned folder.

1. Start a simple python webserver. E.g., one of these commands:
    * `python -m http.server 8000`
    * `python3 -m http.server 8000`
    * `py -m http.server 8000`
    If you are using Python 2 you will need to use `python -m SimpleHTTPServer 8000` instead, but please switch to Python 3 as [Python 2 was sunset on 2020.01.01](https://www.python.org/doc/sunset-python-2/).

1. Wait for the output: `Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/)`

1. Now open your web browser (Firefox or Chrome) and navigate to the URL: http://localhost:8000

## File Structure

```
.
├── index.html               Main page: writeup, the three linked views, legend and controls
├── style.css                Styles for the page and every view
├── README.md                This file
├── LICENSE                  Source code license
├── data/
│   ├── sdg.json             Per-country poverty and completion series and slopes (from scripts/export_json.py)
│   └── world.geojson        Simplified country boundaries keyed by UN M49 code (from scripts/build_map.py)
├── js/
│   ├── constants.js         Shared groups, palette, thresholds, formatters, notable-country rule, 3-survey flag
│   ├── scatterplot.js       V1: quadrant scatterplot with brushing and notable-country labels
│   ├── map.js               V2: choropleth world map with zoom buttons, markers and 3-survey hatching
│   ├── trajectoryPanel.js   V3: survey points and trend lines for the selected countries
│   └── visualization.js     Loads the data, builds the views, links them, and builds the legend, sliders and tooltip
├── scripts/                 Python preprocessing (run locally; not loaded by the page)
│   ├── build.py             Reshapes the UN SDG Goal 1 and Goal 4 exports and fits per-country slopes
│   ├── export_json.py       Turns build.py's output into data/sdg.json
│   └── build_map.py         Joins simplified Natural Earth boundaries to the SDG data as data/world.geojson
├── lib/
│   └── d3.v7/               D3 v7 (d3.v7.min.js and its LICENSE)
├── images/                  Screenshots, diagrams and photos
├── files/                   Slides (PDF) and demo video (MP4)
└── favicons/                Course favicons; do not change
```

Each of `data`, `js`, `lib`, `images`, `files` and `favicons` also has its own `README.md`.

The raw UN SDG exports (`Goal1-data.csv`, `Goal4-data.csv`, `CodeDescriptions.csv`) live in a local `og_dataset/` folder that is listed in `.gitignore` and is not in the repository.

### Rebuilding the data

```
python scripts/build.py og_dataset <out dir> # writes sdg_long.csv, country_year.csv, country_summary.csv
python scripts/export_json.py <out dir> data/sdg.json
python scripts/build_map.py <simplified countries GeoJSON> data/sdg.json data/world.geojson
```

The header of `scripts/build_map.py` gives the one-time mapshaper command that produces the simplified boundary file.

### Script load order

`index.html` loads `lib/d3.v7/d3.v7.min.js`, then `js/constants.js`, the three view files, and `js/visualization.js` last. Each view is a [Reusable Chart](https://bost.ocks.org/mike/chart/), and `visualization.js` links them through one shared `d3.dispatch`.

## Workflow

Since Cameron is the team leader and he owns this GitHub repository, he is designated the project manager and he will deal with merging any pull requests when group members work on their own branches.

Instead of all working directly out of the main branch, you can try adopting a Git branching model for development. See, e.g., [this article by Vincent Driessen](https://nvie.com/posts/a-successful-git-branching-model/).


## Grading

Make sure to check these aspects of your work, which are important for every submission:

* Coding was done properly:
    * Your code was regularly committed and not edited via the GitHub user interface online.
    * You have clear, commented, and validated code.
    * Your web page loads properly and looks as expected in the latest Firefox and Chrome browsers.
    * Any code from other sources (modified or copied straight) is acknowledged.

* Your visualization works as required:
    * Styles are consistent across views.
    * None of the visualizations change size or move on the screen as you interact with them.
    
