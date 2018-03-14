#include "definitions.hpp"
#include <iostream>


#define DB_HOST_ADDR    "tcp://localhost"
#define DB_USER         "root"
#define DB_PASSWORD     "younes"
using namespace std;
void TableManager::init()
{
    try
    {
        sql::Driver *driver;
        driver = get_driver_instance();
        con = driver->connect(DB_HOST_ADDR, DB_USER, DB_PASSWORD);
        log("CONNECTED TO DATABASE");
        con->setSchema("proto_project");
    }
    catch (sql::SQLException &e)
    {
        std::cout << "# ERR: SQLException in "<<std::endl;
        std::cout << "# ERR: " << e.what();
        std::cout << " (MySQL error code: " << e.getErrorCode();
        std::cout << ", SQLState: " << e.getSQLState() << " )" << std::endl;
    }

    std::cout << std::endl;
}
void  TableManager::get_tables_from_DB()
{
    sql::Statement *stmt;
    stmt = con->createStatement();
    sql::ResultSet *res;
    res = stmt->executeQuery("SELECT * FROM `Tables`");
    while (res->next())
    {
        int id          =  stoi(res->getString("id"));
        int position_x  =  stoi(res->getString("position_x"));
        int position_y  =  stoi(res->getString("position_y"));
        int capacity    =  stoi(res->getString("capacity"));
        Table_DB tmp    = {id, position_x, position_y, capacity};
        reference_tables.push_back(tmp);
    }
}

void TableManager::update(){
    setIds();
    assert(con != nullptr);
    sql::Statement *stmt;
    if(check_state()){
        log("STATE CHANGED");
        for(State_DB st : new_state)
        {
            stmt = con->createStatement();
            string query = "INSERT INTO `States`(`table_id`, `occupied_places`) VALUES (";
            query += to_string(st.table_id);
            query += ", ";
            query += to_string(st.occupied_places);
            query += ");";
            log("Execute " + query);
            if(!stmt->execute(query))
                log("LINE WRITTEN TO THE DATBASE");
            old_state = new_state;
        }
    }else{
        log("NO CHANGES");
    }
}
bool TableManager::check_state(){
    if(new_state.size() != old_state.size())
        return true;
    for(int i = 0; i<new_state.size(); i++){
        if(new_state.at(i).occupied_places != old_state.at(i).occupied_places)
            return true;
    }
    return false;
}
void TableManager::setIds()
{
    get_tables_from_DB();
    vector<State_DB> tmp_new_states;
    for(Table & tmp : condidates){
        State_DB tmp_state;
        tmp_state.occupied_places = tmp.occupied_places;
        for(Table_DB table_db : reference_tables){
            if(tmp.center.x == table_db.position_x && tmp.center.y == table_db.position_y){
                tmp_state.table_id = table_db.id;
                cout<<"X = "<<table_db.position_x<<" Y = "<<table_db.position_y<<" table_id "<<tmp_state.table_id<<endl;
            }
        }
        tmp_new_states.push_back(tmp_state);
    }
    new_state = tmp_new_states;
}
void TableManager::init_references()
{
    assert(con != nullptr);
    sql::Statement *stmt;
    for(Table_DB ta : reference_tables)
    {
        stmt = con->createStatement();
        string query = "INSERT INTO `Tables`(`position_x`, `position_y`, `capacity`) VALUES (";
        query += to_string(ta.position_x);
        query += ", ";
        query += to_string(ta.position_x);
        query += ", ";
        query += to_string(4);
        query += ");";
        if(!stmt->execute(query))
            log("LINE WRITTEN TO THE DATBASE");
    }
    //cout<<query<<endl;
    //char *query;
    //sprintf(query, "INSERT INTO `Tables`(`position_x`, `position_y`, `capacity`) VALUES (%d,%d,%d);\n", 1, 10, 100);

}


void TableManager::setReferenceTables(std::vector<Table_DB> tables)
{
    reference_tables = tables;
}
void log(std::string msg)
{
    cout<<"[ LOG ]  "<<msg<<endl;
}
















