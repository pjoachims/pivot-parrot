from pathlib import Path
from setuptools import setup, find_packages

this_directory = Path(__file__).parent
long_description = (this_directory / "README.md").read_text() if (this_directory / "README.md").exists() else ""

setup(
    name="streamlit-pivot-parrot",
    version="0.1.0",
    author="Per Joachims",
    author_email="",
    description="Interactive pivot tables for Streamlit powered by DuckDB",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/streamlit-pivot-parrot",
    packages=find_packages(),
    include_package_data=True,
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Intended Audience :: Science/Research",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Topic :: Scientific/Engineering :: Visualization",
    ],
    python_requires=">=3.8",
    install_requires=[
        "streamlit>=1.0.0",
        "pandas>=1.5.0",
        "pyarrow>=10.0.0",
        "requests>=2.28.0",
    ],
    extras_require={
        "databricks": [
            "databricks-sql-connector",
        ],
        "dev": [
            "pandas",
            "pyarrow",
            "pytest",
            "requests",
        ]
    },
)
