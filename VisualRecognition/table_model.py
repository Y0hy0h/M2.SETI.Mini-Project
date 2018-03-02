import cv2
import numpy as np
from matplotlib import pyplot as plt

size_limit = 40000
std = 40

def plot_hist(img):
    color = ('b','g','r')
    for i,col in enumerate(color):
        histr = cv2.calcHist([img],[i],None,[256],[0,256])
        plt.plot(histr,color = col)
        plt.xlim([0,256])
    plt.show()
    return;

def color_space_means(histo):
    meanR = 160
    meanG = 160
    meanB = 160
    means = (meanR, meanG, meanB) # return a python tuple
    return means

if __name__ == '__main__':
    # Read image
    img = cv2.imread('sampleImages/test2_2.jpg', cv2.IMREAD_COLOR)
    # Display original image
    cv2.namedWindow('original', cv2.WINDOW_NORMAL)
    cv2.resizeWindow('original', 450,600)
    cv2.imshow('original', img)
    cv2.waitKey(0)
    histo = plot_hist(img)
    means = color_space_means(histo)
    print("The mean values of a table region are (R,G,B):", means)
    # test Nº1
    img2 = cv2.imread('sampleImages/test6.jpg', cv2.IMREAD_COLOR)
    cv2.namedWindow('test', cv2.WINDOW_NORMAL)
    cv2.resizeWindow('test', 450,600)
    cv2.imshow('test', img2)
    [height, width, depth] = img2.shape
    mask = np.zeros((height, width, 1), dtype = "uint8")
    i = 0;
    for x in range(height) :
        for y in range(width) :
            if (means[0]-std) <= img2[x,y,2] <= (means[0]+std) :
                if (means[1]-std) <= img2[x,y,1] <= (means[1]+std):
                    if (means[2]-std) <= img2[x,y,0] <= (means[2]+std):
                        mask[x,y] = 255
                        i = i+1
    cv2.namedWindow('mask', cv2.WINDOW_NORMAL)
    cv2.resizeWindow('mask', 450,600)
    cv2.imshow('mask', mask)
    print("There is ", i ," pixels detected as a table")
    cv2.waitKey(0)
    # morphology
    kernel = np.ones((3, 3), dtype="uint8")
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=5)
    cv2.namedWindow('mask2', cv2.WINDOW_NORMAL)
    cv2.resizeWindow('mask2', 450,600)
    cv2.imshow('mask2', mask)
    cv2.waitKey(0)
    # finding connected components
    connectivity = 4
    output = cv2.connectedComponentsWithStats(mask, connectivity, cv2.CV_32S)
    # Get the results
    # The first cell is the number of labels
    num_labels = output[0]
    # The second cell is the label matrix
    labels = output[1]
    # The third cell is the stat matrix
    stats = output[2]
    # The fourth cell is the centroid matrix
    centroids = output[3]
    main_components = []
    print("number of components is:",num_labels)
    for i in range(num_labels) :
        print("the total area of the component", i ," is ", stats[i,4])
        if stats[i,4] > size_limit :
            main_components.append(i)
    print("main components are ", main_components)
    tables = np.zeros((height, width, 1), dtype = "uint8")
    for x in range(height) :
        for y in range(width) :
            for i in main_components :
                if (labels[x,y] == i and i != 0) :
                    tables[x,y] = 255
    cv2.namedWindow('tables', cv2.WINDOW_NORMAL)
    cv2.resizeWindow('tables', 450,600)
    cv2.imshow('tables', tables)
    cv2.waitKey(0)
