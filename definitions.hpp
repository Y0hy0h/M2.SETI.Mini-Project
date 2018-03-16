#include "opencv2/imgproc.hpp"
#include "opencv2/highgui.hpp"
#include <iostream>
#include <stdlib.h>
#include <chrono>
#include <string>

#include "mysql_connection.h"
#include <cppconn/driver.h>
#include <cppconn/exception.h>
#include <cppconn/resultset.h>
#include <cppconn/statement.h>

#define THRESHOLD_VALUE 180
//#define DEBUG 0
#define TABLE_SIZE 1200
#define TOTAL_PLACES_PER_TABLE 4
//#define WRITE_TO_DB 1

struct Table
{
    int id = -1;
    cv::Mat empty;
    cv::Mat full;
    cv::Point center;
    int occupied_places  = 0;
};

struct Table_DB
{
    int id              = -1;
    int position_x      = -1;
    int position_y      = -1;
    int capacity        = -1;
};
struct State_DB{
    int id              = -1;
    int timestamp       = -1;
    int table_id        = -1;
    int occupied_places = -1;
};
using T_DB = std::vector<Table_DB>;
class TableManager
{

public:
    std::vector<Table> condidates;
    std::vector<Table_DB> reference_tables;
    std::vector<State_DB> new_state;
    std::vector<State_DB> old_state;


    sql::Connection *con;


    void setReferenceTables(std::vector<Table_DB>);
    TableManager(std::vector<Table> tmp): condidates(tmp) {}
    void setIds();
    void get_tables_from_DB();
    void init();
    void init_references();
    void update();
    bool check_state();
};

void log(std::string msg);

