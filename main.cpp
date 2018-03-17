#include "definitions.hpp"

using namespace std;
using namespace cv;
using namespace std::chrono;



void filter_contours(vector<vector<Point>> &contours, const int size);
void reference_regions(const char * file_name);
vector<vector<Point>> contours;
float roi_x = 0, roi_y = 1 / 4;
Mat reference;
void mask_image(Mat &source, Mat &mask);
Scalar th(190, 182, 175);
Scalar delta(20, 20, 20);
float processTables(Mat src, Mat dest);
vector<Table> detailles_tables(Mat src, Mat dest);
vector<Table> tablesFactory(Mat ref, Mat current);
int main()
{

    string filename = "vid.mp4";
    VideoCapture capture(filename);
    Mat frame;

    if( !capture.isOpened() )
        throw "Error when reading steam_avi";

    namedWindow( "w", 1);
    reference_regions("empty_table.png");
    high_resolution_clock::time_point t1 = high_resolution_clock::now();
    Mat src;
    Mat trash;
    char c = 1;
    for( ; ; )
    {

        //TESTING MANAGERS
        /*
        vector<Table> tables1 =  detailles_tables(reference, reference);
        TableManager manager(tables1);
        //manager.setReferenceTables(tables1);
        manager.init();
        //manager.init_references();
        manager.update();
        manager.update();
        //manager.run();
        string a = "test";
        return -1;
        */
        //Mat src = imread("in_3.png");

        capture >> src;
        resize(src, src, Size(629, 248));
        //SIZE ROWS = 248 COLS = 629
        //cout<<"Source size: rows = "<<src.rows<< " Cols : "<<src.cols<<endl;
        Rect rec(0, src.rows / 2, src.cols, src.rows / 2);
        Mat roi = src(rec);
        cvtColor(roi, roi, CV_BGR2GRAY);
        mask_image(roi, reference);
        threshold(roi, roi, THRESHOLD_VALUE, 255, THRESH_BINARY);
        vector<Table> tables =  detailles_tables(reference, roi);
        high_resolution_clock::time_point t2 = high_resolution_clock::now();
        #ifdef WRITE_TO_DB
        TableManager manager(tables);
        manager.init();
        manager.update();
        #endif
        auto duration = duration_cast<microseconds>( t2 - t1 ).count();
        for(Table table : tables)
        {
            cout<<table.occupied_places<<endl;
        }
        //cout << duration <<"  Microsecond";
        cout<<"_______________"<<endl;
        imshow("source", roi);
        imshow("or", src);
        imshow("reference", reference * 255);
        //jump frames
        for(auto i = 0 ; i< 20; i++){
            capture>>trash;
        }
        if(c == 1)
            c = waitKey(-1);
        waitKey(1000);

    }
    return 0;
}
//GRAPHANA
//INFLUXDB


vector<Table> detailles_tables(Mat src, Mat dest)
{
    vector<Table> tables = tablesFactory(src, dest);
    for(auto &table: tables)
    {
        float pc = processTables(table.empty, table.full);
        cout<<"PC : "<<pc<<endl;
        if(pc>= .18 && pc <= .42)
            table.occupied_places = 1;
        else if(pc > .42 && pc <= .68)
            table.occupied_places = 2;
        else if(pc > .68 && pc <= .82)
            table.occupied_places = 3;
        else if(pc > .82)
            table.occupied_places = 4;
    }
    return tables;
}
vector<Table> tablesFactory(Mat ref, Mat current)
{
    vector<Table> tables;

    for(auto contour : contours)
    {
        Rect table_template  = boundingRect(contour);
        Mat table1_full   = current(table_template);
        Mat table1_empty  = ref(table_template);
        Table tmp = {-1, table1_empty, table1_full, contour[0]};
        tables.push_back(tmp);
    }
    //cout<<"CONTOUR "<<contours.size()<<endl;
    return tables;
}
float processTables(Mat src, Mat dest)
{
    int white_src = 0, white_dest = 0;
    for(int i = 0; i<src.rows; i++)
    {
        for(int j = 0; j<src.cols; j++)
        {
            //cout<<src.at<uchar>(i, j)<<endl;
            if(src.at<uchar>(i, j) == 1)
                white_src++;
            if(dest.at<uchar>(i, j) == 255)
                white_dest ++;
        }
    }
    //cout <<"WHITE SRC "<< white_src<<" WHITE DEST "<<white_dest<<endl;
    float pc = (float)white_dest/white_src;
    //cout<<"PC "<< pc <<endl;
    return 1 - pc;
}
void mask_image(Mat &source, Mat &mask)
{
    for(int i = 0; i < mask.rows; i++)
    {
        for(int j = 0; j<mask.cols; j++)
        {
            if(mask.at<uchar>(i, j) != 1)
                source.at<uchar>(i, j) = 0;
        }
    }
}
void filter_contours(vector<vector<Point>> &contours, const int size)
{
    for (unsigned int i = 0; i < contours.size(); i++)
    {
        //cout << "Contour id : " << i << " area "
        //<< contourArea(contours[i], false) << endl;
        if (contourArea(contours[i]) < TABLE_SIZE)
        {
            contours.erase(contours.begin() + i);

        }
    }
}

void reference_regions(const char * file_name)
{
    Scalar th(190, 182, 175);
    Scalar delta(20, 20, 20);
    Mat src = imread("empty_table.png");
    resize(src, src, Size(629, 248));
    Mat thresholded;
    Rect rec(0, src.rows / 2, src.cols, src.rows / 2);
    Mat roi = src(rec);
    inRange(roi, th - delta, Scalar(255, 255, 255), thresholded);
    morphologyEx(thresholded, thresholded, MORPH_CLOSE,
                 getStructuringElement(MORPH_RECT, Size(5, 5)));
    morphologyEx(thresholded, thresholded, MORPH_OPEN,
                 getStructuringElement(MORPH_RECT, Size(5, 5)));
    vector<Vec4i> hierarchy;
    Mat contoursMap(thresholded.rows, thresholded.cols, src.type());
    findContours(thresholded, contours, hierarchy, CV_RETR_EXTERNAL,
                 CV_CHAIN_APPROX_NONE);
    filter_contours(contours, 2000);

    drawContours(contoursMap, contours, -1, Scalar(255, 39, 100), 2);
    reference = thresholded / 255;
    imshow("result", thresholded);
#ifdef DEBUG
    namedWindow("contoursMap");
    imshow("contoursMap", contoursMap);
    imshow("result", thresholded);
    imshow("Image", src);
    imshow("ROI", roi);
#endif
}
