"""
Pytest configuration and fixtures for Streamlit pivot-parrot tests
"""

import pytest
import pandas as pd


@pytest.fixture
def sample_dataframe():
    """Sample DataFrame for testing"""
    return pd.DataFrame({
        'region': ['North', 'South', 'East', 'West'] * 10,
        'category': ['Electronics', 'Clothing', 'Food', 'Furniture'] * 10,
        'revenue': [100, 200, 150, 300] * 10,
        'quantity': [10, 20, 15, 30] * 10
    })


@pytest.fixture
def mock_connection():
    """Mock database connection"""
    class MockConn:
        def __init__(self, df=None):
            self.df = df or pd.DataFrame({'test': [1, 2, 3]})
            self.queries = []

        def execute_query(self, sql, timeout=None):
            self.queries.append(sql)
            return self.df

    return MockConn
