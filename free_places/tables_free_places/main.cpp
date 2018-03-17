#include "opencv2/imgproc.hpp"
#include "opencv2/highgui.hpp"
#include <iostream>
#include <stdlib.h>
#define THRESHOLD_VALUE 180
//#define DEBUG 0
#define TABLE_SIZE 1200

using namespace std;
using namespace cv;


typedef struct Table
{
    Mat empty;
    Mat full;
    Point center;
} Table;

void filter_contours(vector<vector<Point>> &contours, const int size);
void reference_regions(const char * file_name);
vector<vector<Point>> contours;
float roi_x = 0, roi_y = 1 / 4;
Mat reference;
void mask_image(Mat &source, Mat &mask);
Scalar th(190, 182, 175);
Scalar delta(20, 20, 20);
float processTables(Mat src, Mat dest);
void detailes_tables(Mat src, Mat dest);
vector<Table> tablesFactory(Mat ref, Mat current);
int main()
{
    reference_regions("empty_table.png");
    Mat src = imread("full_table.png");
    resize(src, src, Size(629, 248));
    //SIZE ROWS = 248 COLS = 629
    //cout<<"Source size: rows = "<<src.rows<< " Cols : "<<src.cols<<endl;
    Rect rec(0, src.rows / 2, src.cols, src.rows / 2);
    Mat roi = src(rec);
    cvtColor(roi, roi, CV_BGR2GRAY);
    mask_image(roi, reference);
    threshold(roi, roi, THRESHOLD_VALUE, 255, THRESH_BINARY);
    detailes_tables(reference, roi);
    imshow("source", roi);
    imshow("reference", reference * 255);
    waitKey(-1);
    return 0;
}
void detailes_tables(Mat src, Mat dest)
{
    vector<Table> tables = tablesFactory(src, dest);
    int i = 0;
    for(auto table: tables)
    {
        float pc = processTables(table.empty, table.full);
        int free_places = 0;
        if(pc>= .22 && pc <= .33)
            free_places = 1;
        else if(pc >= .42 && pc <= .57)
            free_places = 2;
        else if(pc >= .68 && pc <= .82)
            free_places = 3;
        else if(pc >= .93)
            free_places = 4;
        cout<<"[TABLE "<<++i<<"]"<<"@ ("<< table.center.x<<", "\
            <<table.center.y<<")" <<" FREE PLACES "<<free_places<<endl;
    }
}
vector<Table> tablesFactory(Mat ref, Mat current)
{
    vector<Table> tables;

    for(auto contour : contours)
    {
        Rect table_template  = boundingRect(contour);
        Mat table1_full   = current(table_template);
        Mat table1_empty  = ref(table_template);
        Table tmp = {table1_empty, table1_full, contour[0]};
        tables.push_back(tmp);
    }
    //cout<<"CONTOUR "<<contours.size()<<endl;
    for(auto table: tables)
    {
        //cout<<"CENTER "<< table.center.x<<" y = "<<table.center.y<<endl;
    }
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
#ifdef DEBUG
    namedWindow("contoursMap");
    imshow("contoursMap", contoursMap);
    imshow("result", thresholded);
    imshow("Image", src);
    imshow("ROI", roi);
    waitKey(0);
#endif
}
