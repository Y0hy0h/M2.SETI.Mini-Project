<?php
	$hostname='localhost';
	$username='root';
	$password='younes';

	try {
		$pdo = new PDO("mysql:host=$hostname;dbname=proto_project",$username,$password);

		$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
		//echo 'Connected to Database<br/>';
		if(true){
			$sql	= "SELECT * FROM `States` INNER JOIN `Tables` ON States.table_id = Tables.id;";
			$request = $pdo->query($sql);
			$result = array();
			while($row = $request->fetch()){	
				$result[] = ['id' => $row['id'], 'position_x' => $row['position_x'],
				'position_y' => $row['position_y'], 'capacity' => $row['capacity'] ,'occupied_places' => $row['occupied_places']
				,'free_places' => $row['capacity'] - $row['occupied_places'] ];
			}
			//echo json_encode($result);
			$return = $result;
			$return["json"] = json_encode($return);
			echo json_encode($return);
		}
	}
	catch(PDOException $e)
		{
			echo $e->getMessage();
		}
?>
