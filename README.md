# Project of Data Visualization (COM-480)

| Student's name | SCIPER |
| -------------- | ------ |
| | |
| | |
| Dmitry Teploukhov | 339647 |

[Milestone 1](#milestone-1) • [Milestone 2](#milestone-2) • [Milestone 3](#milestone-3)

## Milestone 1 (20th March, 5pm)

**10% of the final grade**

This is a preliminary milestone to let you set up goals for your final project and assess the feasibility of your ideas.
Please, fill the following sections about your project.

*(max. 2000 characters per section)*

### Dataset

> Find a dataset (or multiple) that you will explore. Assess the quality of the data it contains and how much preprocessing / data-cleaning it will require before tackling visualization. We recommend using a standard dataset as this course is not about scraping nor data processing.
>
> Hint: some good pointers for finding quality publicly available datasets ([Google dataset search](https://datasetsearch.research.google.com/), [Kaggle](https://www.kaggle.com/datasets), [OpenSwissData](https://opendata.swiss/en/), [SNAP](https://snap.stanford.edu/data/) and [FiveThirtyEight](https://data.fivethirtyeight.com/)).
Our project uses the US Coast Guard + NOAA AIS Datasets. AIS data consists of vessel traffic records transmitted through the Automatic Identification System, by which vessels continuously broadcast their identity, position, and navigational status while underway. Each broadcast's information constitutes a single AIS data point. The AIS data we use originates from the US Coast Guard's Nationwide Automatic Identification System (NAIS) land-based receiving network and is released by NOAA/BOEM through Marine Cadastre.

These datasets primarily covers the continental United States, Alaska, Hawaii, Guam, and parts of the Caribbean. It typically does not cover the Arctic Ocean, ocean areas 40–50 miles from the coast, or foreign waters. Therefore, our research focuses primarily on US coastal and inland waterway shipping, rather than the vessel activity on the high seas.

These datasets are sourced from Kaggle, which provides all US Coast Guard + NOAA AIS records from 2011 to 2024. We will select several years' data from these datasets for our research. 

We use the 2024 dataset [https://www.kaggle.com/datasets/bwandowando/2024-us-coast-guard-noaa-ais-dataset](https://www.kaggle.com/datasets/bwandowando/2024-us-coast-guard-noaa-ais-datas) as an example to demonstrate the dataset format. This dataset consists of 12 subsets, each corresponding to AIS data for one month. Each subset consists of two tables: the ship's dynamic position data logs (e.g., the 2024_NOAA_AIS_logs_01.parquet file) and the ship's static identity data (e.g., the 2024_NOAA_AIS_ships_01.parquet file). There are a total of 17 available attributes in the two tables: MMSI、BaseDateTime、LAT、LON、SOG、COG、Heading、Status、VesselName、IMO、CallSign、VesselType、Length、Width、Draft、Cargo、TransceiverClass.

### Problematic

> Frame the general topic of your visualization and the main axis that you want to develop.
> - What am I trying to show with my visualization?
> - Think of an overview for the project, your motivation, and the target audience.

### Exploratory Data Analysis

> Pre-processing of the data set you chose
> - Show some basic statistics and get insights about the data

### Related work


> - What others have already done with the data?
> - Why is your approach original?
> - What source of inspiration do you take? Visualizations that you found on other websites or magazines (might be unrelated to your data).
> - In case you are using a dataset that you have already explored in another context (ML or ADA course, semester project...), you are required to share the report of that work to outline the differences with the submission for this class.

## Milestone 2 (17th April, 5pm)

**10% of the final grade**


## Milestone 3 (29th May, 5pm)

**80% of the final grade**


## Late policy

- < 24h: 80% of the grade for the milestone
- < 48h: 70% of the grade for the milestone

